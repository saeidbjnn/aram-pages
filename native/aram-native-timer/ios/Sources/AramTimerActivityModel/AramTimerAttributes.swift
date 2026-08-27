import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct AramTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var status: String
        public var phase: String
        public var startedAt: Date?
        public var expectedEndDate: Date?
        public var remainingSeconds: Double

        public init(status: String, phase: String, startedAt: Date?, expectedEndDate: Date?, remainingSeconds: Double) {
            self.status = status
            self.phase = phase
            self.startedAt = startedAt
            self.expectedEndDate = expectedEndDate
            self.remainingSeconds = remainingSeconds
        }
    }

    public var sessionID: String
    public var modeTitle: String
    public var activityTitle: String?
    public var totalDurationSeconds: Double

    public init(sessionID: String, modeTitle: String, activityTitle: String?, totalDurationSeconds: Double) {
        self.sessionID = sessionID
        self.modeTitle = modeTitle
        self.activityTitle = activityTitle
        self.totalDurationSeconds = totalDurationSeconds
    }
}
