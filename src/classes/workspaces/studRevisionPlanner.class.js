"use strict";

/*
 * Pure local planning helpers. They deliberately receive normalized STUD
 * objects and never fetch, persist or inspect external systems. The planner
 * explains each queue entry rather than assigning an opaque score.
 */

const DAY = 86400000;
const MAX_QUEUE_ITEMS = 24;
const PRIORITY_ORDER = Object.freeze({URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3});

function date(value) { const parsed = value ? new Date(value) : null; return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null; }
function iso(value) { const parsed = date(value); return parsed ? parsed.toISOString() : null; }
function localStart(value = new Date()) { const result = new Date(value); result.setHours(0, 0, 0, 0); return result; }
function isActive(item) { return item && !["COMPLETED", "ARCHIVED"].includes(item.status); }
function explicitSchedule(item) { return iso(item && item.scheduledRevisionAt); }
function suggestedSchedule(item) { return iso(item && item.nextPlannedRevisionAt); }

function queueReason(item, now = new Date(), relatedAssignments = []) {
    const today = localStart(now).getTime();
    const tomorrow = today + DAY;
    const scheduled = explicitSchedule(item);
    const suggested = suggestedSchedule(item);
    const schedule = scheduled || suggested;
    if (schedule) {
        const time = new Date(schedule).getTime();
        if (time < today) return {state: "OVERDUE", reason: `OVERDUE BY ${Math.max(1, Math.floor((today - time) / DAY))} DAY${today - time >= DAY * 2 ? "S" : ""}`, source: scheduled ? "USER_SCHEDULED" : "LOCAL_PLANNER"};
        if (time < tomorrow) return {state: "TODAY", reason: scheduled ? "SCHEDULED TODAY" : "SUGGESTED TODAY", source: scheduled ? "USER_SCHEDULED" : "LOCAL_PLANNER"};
        return {state: "UPCOMING", reason: scheduled ? "SCHEDULED" : "SUGGESTED REVISION", source: scheduled ? "USER_SCHEDULED" : "LOCAL_PLANNER"};
    }
    if (item.pinned) return {state: "TODAY", reason: "MANUALLY PINNED", source: "USER"};
    const related = relatedAssignments.filter(assignment => assignment && !["SUBMITTED", "GRADED", "ARCHIVED"].includes(assignment.status) && date(assignment.dueDate));
    const nearest = related.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    if (nearest) {
        const days = Math.ceil((new Date(nearest.dueDate).getTime() - today) / DAY);
        if (days >= 0 && days <= 7) return {state: "NEEDS_REVIEW", reason: `RELATED ASSIGNMENT DUE IN ${days} DAY${days === 1 ? "" : "S"}`, source: "LOCAL_PLANNER"};
    }
    if (!item.lastStudiedAt || item.confidence === "UNKNOWN") return {state: "NEEDS_REVIEW", reason: "NO RECORDED STUDY CONFIDENCE", source: "LOCAL_PLANNER"};
    return {state: "UNSCHEDULED", reason: "UNSCHEDULED LOCAL REVISION", source: "LOCAL"};
}

function spacedRevisionSuggestion(item, completedAt = new Date(), confidence = item && item.confidence) {
    if (!item || !item.spacedRevisionEnabled || !["LOW", "MEDIUM", "HIGH"].includes(confidence)) return null;
    const successful = Math.max(0, Number(item.successfulRevisionCount) || 0);
    const intervals = confidence === "LOW" ? [1, 1, 2, 3, 5] : confidence === "MEDIUM" ? [2, 4, 7, 14, 21, 30] : [3, 7, 14, 28, 45, 60];
    const days = intervals[Math.min(successful, intervals.length - 1)];
    const next = new Date(completedAt);
    next.setDate(next.getDate() + days);
    return Object.freeze({nextPlannedRevisionAt: next.toISOString(), intervalDays: days, reason: `LOCAL SPACED REVISION · ${confidence} CONFIDENCE · ${days} DAY${days === 1 ? "" : "S"}`, successfulRevisionCount: successful + (confidence === "LOW" ? 0 : 1)});
}

function buildPlan(items = [], assignmentsByItem = new Map(), now = new Date(), limit = MAX_QUEUE_ITEMS) {
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || MAX_QUEUE_ITEMS, MAX_QUEUE_ITEMS));
    const rows = items.filter(isActive).map(item => {
        const detail = queueReason(item, now, assignmentsByItem.get(item.id) || []);
        return {...item, planning: detail};
    }).filter(item => {
        if (item.planning.source === "LOCAL_PLANNER" && item.suggestionDismissedUntil) {
            const dismissed = date(item.suggestionDismissedUntil);
            return !dismissed || dismissed.getTime() <= now.getTime();
        }
        return true;
    }).sort((a, b) => {
        const stateOrder = {OVERDUE: 0, TODAY: 1, NEEDS_REVIEW: 2, UPCOMING: 3, UNSCHEDULED: 4};
        const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        const position = (a.planPosition ?? 999999) - (b.planPosition ?? 999999);
        return pin || stateOrder[a.planning.state] - stateOrder[b.planning.state] || position || PRIORITY_ORDER[a.priority || "NORMAL"] - PRIORITY_ORDER[b.priority || "NORMAL"] || String(a.title).localeCompare(String(b.title));
    });
    return Object.freeze(rows.slice(0, normalizedLimit).map(Object.freeze));
}

function overview(items = [], assignmentsByItem = new Map(), now = new Date(), limit = 12) {
    const plan = buildPlan(items, assignmentsByItem, now, limit * 2);
    const select = state => plan.filter(item => item.planning.state === state).slice(0, limit);
    const distribution = items.filter(isActive).reduce((result, item) => { const key = item.courseId || "UNASSIGNED"; result[key] = (result[key] || 0) + 1; return result; }, {});
    return Object.freeze({today: Object.freeze(select("TODAY")), upcoming: Object.freeze(select("UPCOMING")), overdue: Object.freeze(select("OVERDUE")), highPriority: Object.freeze(plan.filter(item => ["URGENT", "HIGH"].includes(item.priority)).slice(0, limit)), recentlyStudied: Object.freeze(items.filter(item => item.lastStudiedAt).sort((a, b) => String(b.lastStudiedAt).localeCompare(String(a.lastStudiedAt))).slice(0, limit)), unscheduled: Object.freeze(select("UNSCHEDULED")), needsReview: Object.freeze(select("NEEDS_REVIEW")), courseDistribution: Object.freeze(distribution), plan});
}

module.exports = Object.freeze({DAY, MAX_QUEUE_ITEMS, queueReason, spacedRevisionSuggestion, buildPlan, overview});
