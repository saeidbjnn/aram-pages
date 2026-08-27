import ActivityKit
import Foundation
import AramTimerActivityModel
import SwiftUI
import WidgetKit

private enum AramActivityFormat {
    static let persianLocale = Locale(identifier: "fa_IR")

    static func mode(_ context: ActivityViewContext<AramTimerAttributes>) -> String {
        switch context.state.phase {
        case "break": return "استراحت"
        case "work": return "کار"
        default: return "تمرکز"
        }
    }

    static func remaining(_ seconds: Double) -> String {
        let value = max(0, Int(seconds.rounded(.up)))
        let hours = value / 3600
        let minutes = (value % 3600) / 60
        let seconds = value % 60
        let latin = hours > 0
            ? String(format: "%02d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
        return latin.applyingTransform(StringTransform("Latin-Arabic"), reverse: false) ?? latin
    }

    static func accessibilityRemaining(_ seconds: Double) -> String {
        let value = max(0, Int(seconds.rounded(.up)))
        let hours = value / 3600
        let minutes = (value % 3600) / 60
        let seconds = value % 60
        var parts: [String] = []
        if hours > 0 { parts.append("\(hours) ساعت") }
        if minutes > 0 { parts.append("\(minutes) دقیقه") }
        if seconds > 0 || parts.isEmpty { parts.append("\(seconds) ثانیه") }
        return parts.joined(separator: " و ")
    }
}

private struct AramCountdownText: View {
    let context: ActivityViewContext<AramTimerAttributes>
    let compact: Bool

    var body: some View {
        Group {
            if context.isStale {
                Text("۰۰:۰۰").monospacedDigit()
            } else if context.state.status == "running", let end = context.state.expectedEndDate {
                Text(timerInterval: min(Date.now, end)...end, countsDown: true)
                    .monospacedDigit()
            } else if context.state.status == "paused" {
                Text(AramActivityFormat.remaining(context.state.remainingSeconds))
                    .monospacedDigit()
            } else {
                Text("۰۰:۰۰")
                    .monospacedDigit()
            }
        }
        .font(compact ? .system(.caption, design: .rounded, weight: .semibold) : .system(.title2, design: .rounded, weight: .semibold))
        .environment(\.locale, AramActivityFormat.persianLocale)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        if context.isStale { return "زمان تایمر به پایان رسیده است" }
        if context.state.status == "paused" {
            return "\(AramActivityFormat.accessibilityRemaining(context.state.remainingSeconds)) باقی مانده، تایمر متوقف شده"
        }
        if context.state.status == "completed" { return "تایمر کامل شد" }
        if context.state.status == "cancelled" { return "تایمر لغو شد" }
        return "زمان باقی‌مانده تا پایان \(AramActivityFormat.mode(context))"
    }
}

private struct AramActivityProgress: View {
    let context: ActivityViewContext<AramTimerAttributes>

    var body: some View {
        Group {
            if context.isStale {
                ProgressView(value: 1)
            } else if context.state.status == "running",
               let start = context.state.startedAt,
               let end = context.state.expectedEndDate,
               start < end {
                ProgressView(timerInterval: start...end, countsDown: false)
            } else {
                let total = max(1, context.attributes.totalDurationSeconds)
                let progress = min(1, max(0, 1 - (context.state.remainingSeconds / total)))
                ProgressView(value: progress)
            }
        }
        .tint(.primary)
        .accessibilityHidden(true)
    }
}

struct AramLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AramTimerAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(Color.black.opacity(0.92))
                .activitySystemActionForegroundColor(.white)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, AramActivityFormat.persianLocale)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("آرام").font(.caption2).foregroundStyle(.secondary)
                        Text(AramActivityFormat.mode(context)).font(.headline)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    AramCountdownText(context: context, compact: false)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .trailing, spacing: 7) {
                        if let title = context.attributes.activityTitle, !title.isEmpty {
                            Text(title).font(.caption).lineLimit(1)
                        }
                        AramActivityProgress(context: context)
                        statusText(context)
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
            } compactLeading: {
                Text("آ")
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .accessibilityLabel("آرام")
            } compactTrailing: {
                AramCountdownText(context: context, compact: true)
                    .frame(maxWidth: 60)
            } minimal: {
                Image(systemName: context.state.status == "paused" ? "pause.fill" : "timer")
                    .accessibilityLabel(context.state.status == "paused" ? "تایمر متوقف شده" : "تایمر آرام")
            }
            .keylineTint(.white.opacity(0.75))
        }
    }

    @ViewBuilder
    private func lockScreen(_ context: ActivityViewContext<AramTimerAttributes>) -> some View {
        VStack(alignment: .trailing, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("آرام")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(AramActivityFormat.mode(context))
                        .font(.headline)
                }
                Spacer(minLength: 12)
                AramCountdownText(context: context, compact: false)
            }
            if let title = context.attributes.activityTitle, !title.isEmpty {
                Text(title)
                    .font(.subheadline)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            AramActivityProgress(context: context)
            statusText(context)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .foregroundStyle(.white)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func statusText(_ context: ActivityViewContext<AramTimerAttributes>) -> some View {
        Group {
            if context.isStale {
                Text(context.state.phase == "break" ? "زمان استراحت تمام شد" : "جلسه تمرکز تمام شد")
            } else {
              switch context.state.status {
            case "paused":
                Text("متوقف شده")
            case "completed":
                Text(context.state.phase == "break" ? "زمان استراحت تمام شد" : "جلسه تمرکز تمام شد")
            case "cancelled":
                Text("تایمر متوقف شد")
            default:
                Text("در حال اجرا")
              }
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
}
