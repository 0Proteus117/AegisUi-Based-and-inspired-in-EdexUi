import EventKit
import Foundation

struct CalendarOutput: Codable {
    let authorized: Bool
    let calendars: [CalendarItem]
    let events: [EventItem]
    let error: String?
}

struct CalendarItem: Codable {
    let id: String
    let name: String
    let account: String
    let color: String
}

struct EventItem: Codable {
    let id: String
    let title: String
    let start: String
    let end: String
    let location: String
    let calendarId: String
    let calendar: String
    let allDay: Bool
}

@main
struct CalendarHelper {
    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        return encoder
    }()

    static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func printOutput(_ output: CalendarOutput) {
        guard let data = try? encoder.encode(output),
              let json = String(data: data, encoding: .utf8) else {
            print(#"{"authorized":false,"calendars":[],"events":[],"error":"Encoding failed."}"#)
            return
        }
        if CommandLine.arguments.count >= 4 {
            try? data.write(to: URL(fileURLWithPath: CommandLine.arguments[3]), options: .atomic)
        }
        print(json)
    }

    static func colorHex(_ calendar: EKCalendar) -> String {
        guard let components = calendar.cgColor.components else { return "#3BA7FF" }
        let red: CGFloat
        let green: CGFloat
        let blue: CGFloat
        if components.count >= 3 {
            red = components[0]
            green = components[1]
            blue = components[2]
        } else if let white = components.first {
            red = white
            green = white
            blue = white
        } else {
            return "#3BA7FF"
        }
        return String(
            format: "#%02X%02X%02X",
            Int(max(0, min(1, red)) * 255),
            Int(max(0, min(1, green)) * 255),
            Int(max(0, min(1, blue)) * 255)
        )
    }

    static func main() async {
        guard CommandLine.arguments.count >= 3,
              let startMilliseconds = Double(CommandLine.arguments[1]),
              let endMilliseconds = Double(CommandLine.arguments[2]) else {
            printOutput(CalendarOutput(
                authorized: false,
                calendars: [],
                events: [],
                error: "Expected start and end timestamps."
            ))
            return
        }

        let store = EKEventStore()
        do {
            let granted: Bool
            if #available(macOS 14.0, *) {
                granted = try await store.requestFullAccessToEvents()
            } else {
                granted = try await withCheckedThrowingContinuation { continuation in
                    store.requestAccess(to: .event) { allowed, error in
                        if let error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume(returning: allowed)
                        }
                    }
                }
            }

            guard granted else {
                printOutput(CalendarOutput(
                    authorized: false,
                    calendars: [],
                    events: [],
                    error: "Calendar access was not granted."
                ))
                return
            }

            let start = Date(timeIntervalSince1970: startMilliseconds / 1000)
            let end = Date(timeIntervalSince1970: endMilliseconds / 1000)
            let eventCalendars = store.calendars(for: .event)
            let calendarItems = eventCalendars.map { calendar in
                CalendarItem(
                    id: calendar.calendarIdentifier,
                    name: calendar.title,
                    account: calendar.source.title,
                    color: colorHex(calendar)
                )
            }.sorted {
                if $0.account == $1.account { return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                return $0.account.localizedCaseInsensitiveCompare($1.account) == .orderedAscending
            }

            let predicate = store.predicateForEvents(
                withStart: start,
                end: end,
                calendars: eventCalendars
            )
            let eventItems = store.events(matching: predicate).map { event in
                EventItem(
                    id: event.eventIdentifier ?? UUID().uuidString,
                    title: event.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                        ? event.title!
                        : "Untitled event",
                    start: isoFormatter.string(from: event.startDate),
                    end: isoFormatter.string(from: event.endDate),
                    location: event.location ?? "",
                    calendarId: event.calendar.calendarIdentifier,
                    calendar: event.calendar.title,
                    allDay: event.isAllDay
                )
            }.sorted { $0.start < $1.start }

            printOutput(CalendarOutput(
                authorized: true,
                calendars: calendarItems,
                events: eventItems,
                error: nil
            ))
        } catch {
            printOutput(CalendarOutput(
                authorized: false,
                calendars: [],
                events: [],
                error: error.localizedDescription
            ))
        }
    }
}
