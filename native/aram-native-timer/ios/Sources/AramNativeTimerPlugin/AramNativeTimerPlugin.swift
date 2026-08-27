import ActivityKit
import AramTimerActivityModel
import AudioToolbox
import AVFoundation
import Capacitor
import Foundation
import UIKit
import UserNotifications

@objc(AramNativeTimerPlugin)
public final class AramNativeTimerPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "AramNativeTimerPlugin"
    public let jsName = "AramNativeTimer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "completeTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewSound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSoundPreview", returnType: CAPPluginReturnPromise)
    ]

    private let notificationCenter = UNUserNotificationCenter.current()
    private let isoFormatter = ISO8601DateFormatter()
    private let fractionalISOFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private var previewPlayer: AVAudioPlayer?
    private let notificationPrefix = "aram.timer."

    public override func load() {
        notificationCenter.delegate = self
        installNotificationSoundsIfNeeded()
        Task { await cleanupDuplicateActivities() }
    }

    @objc public func getCapabilities(_ call: CAPPluginCall) {
        notificationCenter.getNotificationSettings { settings in
            let permission: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: permission = "granted"
            case .denied: permission = "denied"
            case .notDetermined: permission = "prompt"
            @unknown default: permission = "unknown"
            }

            var liveSupported = false
            var liveEnabled = false
            if #available(iOS 16.1, *) {
                liveSupported = true
                liveEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
            }

            call.resolve([
                "notificationsSupported": true,
                "notificationPermission": permission,
                "liveActivitiesSupported": liveSupported,
                "liveActivitiesEnabledBySystem": liveEnabled,
                "hapticsSupported": true,
                "soundPreviewSupported": true,
                "iosVersion": UIDevice.current.systemVersion
            ])
        }
    }

    @objc public func requestNotificationPermission(_ call: CAPPluginCall) {
        notificationCenter.requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error {
                call.reject("Notification permission request failed", nil, error)
                return
            }
            call.resolve(["permission": granted ? "granted" : "denied"])
        }
    }

    @objc public func openNotificationSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString), UIApplication.shared.canOpenURL(url) else {
                call.reject("Unable to open iOS Settings")
                return
            }
            UIApplication.shared.open(url) { opened in
                if opened { call.resolve() } else { call.reject("Unable to open iOS Settings") }
            }
        }
    }

    @objc public func syncTimer(_ call: CAPPluginCall) {
        guard let timer = call.getObject("timer"), let preferences = call.getObject("preferences") else {
            call.reject("Missing timer synchronization payload")
            return
        }
        let reason = call.getString("reason") ?? "sync"
        Task {
            do {
                try await synchronize(timer: timer, preferences: preferences, reason: reason)
                call.resolve()
            } catch {
                call.reject("Native timer synchronization failed", nil, error)
            }
        }
    }

    @objc public func completeTimer(_ call: CAPPluginCall) {
        let sessions = call.getArray("completedSessions", JSObject.self) ?? []
        guard let nextTimer = call.getObject("nextTimer"), let preferences = call.getObject("preferences") else {
            call.reject("Missing completion payload")
            return
        }
        Task {
            do {
                let completedIDs = Set(sessions.compactMap { $0["id"] as? String })
                let completedKind = sessions.last?["kind"] as? String ?? "focus"
                try await endCompletedActivities(sessionIDs: completedIDs, completedKind: completedKind)
                if (preferences["hapticsEnabled"] as? Bool ?? true) {
                    await MainActor.run { UINotificationFeedbackGenerator().notificationOccurred(.success) }
                }
                // When native notifications are unavailable/disabled, the app may
                // still be foregrounded at completion. Play the selected sound
                // directly in that case. If a notification is authorized, its
                // notification sound remains the single completion sound source.
                let authorizationStatus = await notificationAuthorizationStatus()
                let notificationCanSound = (preferences["notificationsEnabled"] as? Bool ?? false)
                    && [.authorized, .provisional, .ephemeral].contains(authorizationStatus)
                if !notificationCanSound {
                    await playForegroundCompletionSound(preferences["sound"] as? String ?? "calm")
                }
                if (nextTimer["status"] as? String) == "running" {
                    try await synchronize(timer: nextTimer, preferences: preferences, reason: "auto_continue")
                }
                call.resolve()
            } catch {
                call.reject("Native timer completion failed", nil, error)
            }
        }
    }

    @objc public func previewSound(_ call: CAPPluginCall) {
        let sound = call.getString("sound") ?? "calm"
        DispatchQueue.main.async {
            self.stopPreview()
            if sound == "none" {
                call.resolve()
                return
            }
            if sound == "system" {
                AudioServicesPlaySystemSound(1007)
                call.resolve()
                return
            }
            guard let file = self.soundFilename(for: sound),
                  let url = Bundle.module.url(forResource: file.deletingPathExtension, withExtension: file.pathExtension) else {
                AudioServicesPlaySystemSound(1007)
                call.resolve(["fallback": true])
                return
            }
            do {
                self.previewPlayer = try AVAudioPlayer(contentsOf: url)
                self.previewPlayer?.prepareToPlay()
                self.previewPlayer?.play()
                call.resolve()
            } catch {
                AudioServicesPlaySystemSound(1007)
                call.resolve(["fallback": true])
            }
        }
    }

    @objc public func stopSoundPreview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopPreview()
            call.resolve()
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.identifier.hasPrefix(notificationPrefix) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([])
        }
    }

    private func synchronize(timer: JSObject, preferences: JSObject, reason: String) async throws {
        let status = timer["status"] as? String ?? "idle"
        let sessionID = timer["sessionId"] as? String
        let hapticsEnabled = preferences["hapticsEnabled"] as? Bool ?? true

        if hapticsEnabled {
            await performHaptic(reason: reason)
        }

        if status == "idle" || sessionID == nil {
            await cancelAllPendingTimerNotifications()
            if #available(iOS 16.1, *) {
                await endAllActivitiesAsCancelled()
            }
            return
        }

        if status == "paused" {
            if let sessionID { notificationCenter.removePendingNotificationRequests(withIdentifiers: [notificationIdentifier(sessionID)]) }
            if #available(iOS 16.1, *), preferences["liveActivitiesEnabled"] as? Bool ?? true {
                try await updateLiveActivity(timer: timer, paused: true)
            }
            return
        }

        guard status == "running", let sessionID else { return }
        if preferences["notificationsEnabled"] as? Bool ?? false {
            try await scheduleCompletionNotification(timer: timer, preferences: preferences, sessionID: sessionID)
        } else {
            notificationCenter.removePendingNotificationRequests(withIdentifiers: [notificationIdentifier(sessionID)])
        }

        if #available(iOS 16.1, *), preferences["liveActivitiesEnabled"] as? Bool ?? true {
            try await updateLiveActivity(timer: timer, paused: false)
        } else if #available(iOS 16.1, *) {
            await endAllActivitiesAsCancelled()
        }
    }

    private func scheduleCompletionNotification(timer: JSObject, preferences: JSObject, sessionID: String) async throws {
        guard let endString = timer["expectedEndDate"] as? String,
              let endDate = parseISODate(endString), endDate.timeIntervalSinceNow > 0 else { return }

        let identifier = notificationIdentifier(sessionID)
        notificationCenter.removePendingNotificationRequests(withIdentifiers: [identifier])

        let content = UNMutableNotificationContent()
        let phase = timer["phase"] as? String ?? "focus"
        let duration = Int((timer["totalDurationSeconds"] as? Double ?? 0).rounded())
        let durationMinutes = max(1, Int(round(Double(duration) / 60.0)))
        let custom = timer["durationSource"] as? String == "custom"

        switch phase {
        case "break":
            content.title = "استراحت تمام شد"
            content.body = "وقت برگشتن به کار است."
        case "work":
            content.title = "زمان کار تمام شد"
            content.body = "بازه کاری شما به پایان رسید."
        default:
            content.title = custom ? "تایمر به پایان رسید" : "زمان تمرکز تمام شد"
            content.body = custom ? "زمان تنظیم‌شده شما به پایان رسید." : "جلسه \(durationMinutes) دقیقه‌ای شما به پایان رسید."
        }
        content.threadIdentifier = "aram-timer"
        content.userInfo = ["aramSessionId": sessionID, "aramTimerPhase": phase]
        content.sound = notificationSound(for: preferences["sound"] as? String ?? "calm")

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, endDate.timeIntervalSinceNow), repeats: false)
        try await notificationCenter.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    }

    private func notificationSound(for sound: String) -> UNNotificationSound? {
        if sound == "none" { return nil }
        if sound == "system" { return .default }
        guard let filename = soundFilename(for: sound) else { return .default }
        return UNNotificationSound(named: UNNotificationSoundName(filename))
    }

    private func soundFilename(for key: String) -> String? {
        switch key {
        case "calm": return "aram-calm.wav"
        case "soft-bell": return "aram-soft-bell.wav"
        case "chime": return "aram-chime.wav"
        case "minimal": return "aram-minimal.wav"
        default: return nil
        }
    }


    private func notificationAuthorizationStatus() async -> UNAuthorizationStatus {
        await withCheckedContinuation { continuation in
            notificationCenter.getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
    }

    private func playForegroundCompletionSound(_ sound: String) async {
        guard sound != "none" else { return }
        await MainActor.run {
            self.stopPreview()
            if sound == "system" {
                AudioServicesPlaySystemSound(1007)
                return
            }
            guard let filename = self.soundFilename(for: sound),
                  let url = Bundle.module.url(forResource: filename.deletingPathExtension, withExtension: filename.pathExtension) else {
                AudioServicesPlaySystemSound(1007)
                return
            }
            do {
                self.previewPlayer = try AVAudioPlayer(contentsOf: url)
                self.previewPlayer?.prepareToPlay()
                self.previewPlayer?.play()
            } catch {
                AudioServicesPlaySystemSound(1007)
            }
        }
    }

    private func notificationIdentifier(_ sessionID: String) -> String {
        "\(notificationPrefix)\(sessionID)"
    }

    private func cancelAllPendingTimerNotifications() async {
        let requests = await notificationCenter.pendingNotificationRequests()
        let identifiers = requests.map(\.identifier).filter { $0.hasPrefix(notificationPrefix) }
        if !identifiers.isEmpty { notificationCenter.removePendingNotificationRequests(withIdentifiers: identifiers) }
    }

    @available(iOS 16.1, *)
    private func updateLiveActivity(timer: JSObject, paused: Bool) async throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled,
              let sessionID = timer["sessionId"] as? String else { return }

        let modeTitle = timer["modeLabel"] as? String ?? "تمرکز"
        let total = timer["totalDurationSeconds"] as? Double ?? 1
        let remaining = timer["remainingSeconds"] as? Double ?? 0
        let startDate = (timer["startDate"] as? String).flatMap(parseISODate)
        let endDate = (timer["expectedEndDate"] as? String).flatMap(parseISODate)
        let phase = timer["phase"] as? String ?? "focus"
        let state = AramTimerAttributes.ContentState(
            status: paused ? "paused" : "running",
            phase: phase,
            startedAt: startDate,
            expectedEndDate: paused ? nil : endDate,
            remainingSeconds: remaining
        )
        let content = ActivityContent(state: state, staleDate: paused ? nil : endDate, relevanceScore: 1)

        if let existing = Activity<AramTimerAttributes>.activities.first(where: { $0.attributes.sessionID == sessionID }) {
            await existing.update(content)
            return
        }

        await endActivities(except: sessionID)
        let attributes = AramTimerAttributes(sessionID: sessionID, modeTitle: modeTitle, activityTitle: nil, totalDurationSeconds: total)
        _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
    }

    @available(iOS 16.1, *)
    private func endCompletedActivities(sessionIDs: Set<String>, completedKind: String) async throws {
        for activity in Activity<AramTimerAttributes>.activities where sessionIDs.isEmpty || sessionIDs.contains(activity.attributes.sessionID) {
            let messageStatus = "completed"
            let state = AramTimerAttributes.ContentState(
                status: messageStatus,
                phase: completedKind,
                startedAt: activity.content.state.startedAt,
                expectedEndDate: nil,
                remainingSeconds: 0
            )
            let content = ActivityContent(state: state, staleDate: nil, relevanceScore: 0)
            await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(60)))
        }
    }

    @available(iOS 16.1, *)
    private func endActivities(except sessionID: String) async {
        for activity in Activity<AramTimerAttributes>.activities where activity.attributes.sessionID != sessionID {
            let state = AramTimerAttributes.ContentState(status: "cancelled", phase: activity.content.state.phase, startedAt: activity.content.state.startedAt, expectedEndDate: nil, remainingSeconds: 0)
            await activity.end(ActivityContent(state: state, staleDate: nil, relevanceScore: 0), dismissalPolicy: .immediate)
        }
    }

    @available(iOS 16.1, *)
    private func endAllActivitiesAsCancelled() async {
        for activity in Activity<AramTimerAttributes>.activities {
            let state = AramTimerAttributes.ContentState(status: "cancelled", phase: activity.content.state.phase, startedAt: activity.content.state.startedAt, expectedEndDate: nil, remainingSeconds: activity.content.state.remainingSeconds)
            await activity.end(ActivityContent(state: state, staleDate: nil, relevanceScore: 0), dismissalPolicy: .immediate)
        }
    }

    @available(iOS 16.1, *)
    private func cleanupDuplicateActivities() async {
        let activities = Activity<AramTimerAttributes>.activities
        guard activities.count > 1 else { return }
        let keep = activities.max { $0.id < $1.id }
        for activity in activities where activity.id != keep?.id {
            let state = AramTimerAttributes.ContentState(status: "cancelled", phase: activity.content.state.phase, startedAt: activity.content.state.startedAt, expectedEndDate: nil, remainingSeconds: activity.content.state.remainingSeconds)
            await activity.end(ActivityContent(state: state, staleDate: nil, relevanceScore: 0), dismissalPolicy: .immediate)
        }
    }

    private func performHaptic(reason: String) async {
        await MainActor.run {
            switch reason {
            case "start", "resume", "auto_continue": UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case "pause": UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            case "stop": UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.55)
            default: break
            }
        }
    }

    private func installNotificationSoundsIfNeeded() {
        guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        let soundsDirectory = library.appendingPathComponent("Sounds", isDirectory: true)
        try? FileManager.default.createDirectory(at: soundsDirectory, withIntermediateDirectories: true)
        for key in ["calm", "soft-bell", "chime", "minimal"] {
            guard let filename = soundFilename(for: key),
                  let source = Bundle.module.url(forResource: filename.deletingPathExtension, withExtension: filename.pathExtension) else { continue }
            let destination = soundsDirectory.appendingPathComponent(filename)
            if !FileManager.default.fileExists(atPath: destination.path) {
                try? FileManager.default.copyItem(at: source, to: destination)
            }
        }
    }

    private func parseISODate(_ value: String) -> Date? {
        fractionalISOFormatter.date(from: value) ?? isoFormatter.date(from: value)
    }

    private func stopPreview() {
        previewPlayer?.stop()
        previewPlayer = nil
    }
}

private extension String {
    var deletingPathExtension: String { (self as NSString).deletingPathExtension }
    var pathExtension: String { (self as NSString).pathExtension }
}
