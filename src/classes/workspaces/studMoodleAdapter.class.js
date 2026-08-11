"use strict";

const Lms = require("./studLmsModel.class.js");

const READ_FUNCTIONS = Object.freeze({
    SITE_INFO: "core_webservice_get_site_info",
    COURSES: "core_enrol_get_users_courses",
    COURSE_CONTENT: "core_course_get_contents",
    ASSIGNMENTS: "mod_assign_get_assignments",
    ASSIGNMENT_STATUS: "mod_assign_get_submission_status",
    CALENDAR: "core_calendar_get_calendar_events",
    GRADES: "gradereport_user_get_grade_items",
    COMPLETION: "core_completion_get_activities_completion_status",
    FORUM_READ: "mod_forum_get_forums_by_courses"
});

function capabilityFromError(error) {
    if (error.code === "PERMISSION_DENIED") return "PERMISSION_DENIED";
    if (["SERVICE_DISABLED", "PROTOCOL_DISABLED"].includes(error.code)) return "NOT_EXPOSED";
    if (["CAPABILITY_UNAVAILABLE", "INVALID_TOKEN", "AUTH_REQUIRED"].includes(error.code)) return "UNSUPPORTED";
    if (["OFFLINE", "TIMEOUT", "RATE_LIMITED", "SERVER_ERROR", "MALFORMED_RESPONSE"].includes(error.code)) return "UNKNOWN";
    return "UNKNOWN";
}

function isoFromUnix(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : null;
}

function assignmentStatus(value) {
    const status = String(value || "").toUpperCase();
    if (status.includes("GRADE")) return "GRADED";
    if (status.includes("SUBMIT")) return "SUBMITTED";
    return "IN_PROGRESS";
}

function submissionStatus(value) {
    const status = String(value || "").toUpperCase();
    if (status.includes("SUBMITTED") || status.includes("DRAFT")) return "SUBMITTED";
    if (status.includes("NEW") || status.includes("NOT")) return "NOT_SUBMITTED";
    return "UNKNOWN";
}

function flattenAssignments(payload) {
    const courses = Array.isArray(payload && payload.courses) ? payload.courses : [];
    return courses.flatMap(course => (Array.isArray(course.assignments) ? course.assignments : []).map(item => ({...item, courseid: item.courseid || course.id})));
}

function formEncode(params = {}) {
    const body = new URLSearchParams();
    const visit = (prefix, value) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) return value.forEach((item, index) => visit(`${prefix}[${index}]`, item));
        if (typeof value === "object") return Object.entries(value).forEach(([key, item]) => visit(`${prefix}[${key}]`, item));
        body.set(prefix, String(value));
    };
    Object.entries(params).forEach(([key, value]) => visit(key, value));
    return body;
}

class MoodleAdapter {
    constructor(options = {}) {
        this.baseUrl = Lms.normalizeBaseUrl(options.baseUrl, {allowLocalDevelopment: options.allowLocalDevelopment === true});
        this.token = Lms.text(options.token, "Moodle token", Lms.LIMITS.token, true);
        this.fetch = options.fetch || globalThis.fetch;
        if (typeof this.fetch !== "function") throw new Lms.LmsError("OFFLINE", "Moodle networking is unavailable.");
        this.timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 12000, 30000));
        this.controllers = options.controllers || new Map();
        this.requestId = options.requestId || Lms.createRequestId();
    }

    endpoint() { return Lms.deriveMoodleEndpoint(this.baseUrl); }

    async call(functionName, parameters = {}) {
        if (!Object.values(READ_FUNCTIONS).includes(functionName)) throw new Lms.LmsError("POLICY_BLOCKED", "Aegis permits only audited Moodle read functions.");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error("timeout")), this.timeoutMs);
        this.controllers.set(this.requestId, controller);
        try {
            const body = formEncode({wstoken: this.token, wsfunction: functionName, moodlewsrestformat: "json", ...parameters});
            const response = await this.fetch(this.endpoint(), {method: "POST", credentials: "omit", redirect: "error", cache: "no-store", headers: {"content-type": "application/x-www-form-urlencoded;charset=UTF-8", accept: "application/json"}, body, signal: controller.signal});
            if (response.status === 429) throw new Lms.LmsError("RATE_LIMITED", "Moodle rate-limited this explicit read request.");
            if (!response.ok) throw new Lms.LmsError("SERVER_ERROR", `Moodle returned HTTP ${response.status}.`);
            const contentLength = Number(response.headers && response.headers.get && response.headers.get("content-length"));
            if (Number.isFinite(contentLength) && contentLength > Lms.LIMITS.responseBytes) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle response exceeded the permitted size.");
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.byteLength > Lms.LIMITS.responseBytes) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle response exceeded the permitted size.");
            let payload;
            try { payload = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle returned invalid JSON."); }
            if (payload && (payload.exception || payload.errorcode)) throw Lms.mapMoodleError(payload);
            return payload;
        } catch (error) {
            if (error instanceof Lms.LmsError) throw error;
            if (controller.signal.aborted) throw new Lms.LmsError("CANCELLED", "Moodle request was cancelled.");
            if (error && /timeout/i.test(String(error.message || ""))) throw new Lms.LmsError("TIMEOUT", "Moodle did not respond within the bounded timeout.");
            throw new Lms.LmsError("OFFLINE", "Moodle could not be reached from this device.");
        } finally {
            clearTimeout(timeout);
            if (this.controllers.get(this.requestId) === controller) this.controllers.delete(this.requestId);
        }
    }

    async probe() {
        const capabilities = {...Lms.emptyCapabilities()};
        const result = {instance: null, courses: [], assignments: [], calendar: [], capabilities, errors: {}};
        try {
            const site = await this.call(READ_FUNCTIONS.SITE_INFO);
            result.instance = {siteName: Lms.sanitizeDisplayText(site.sitename, 240), userId: Number(site.userid) || null, userName: Lms.sanitizeDisplayText(site.username, 120), mobileService: Array.isArray(site.functions) ? "FUNCTION_LIST_EXPOSED" : "UNKNOWN"};
            capabilities.SITE_INFO = "SUPPORTED";
        } catch (error) { capabilities.SITE_INFO = capabilityFromError(error); result.errors.SITE_INFO = error.code; throw Object.assign(error, {probe: result}); }
        try {
            const courses = await this.call(READ_FUNCTIONS.COURSES, {userid: result.instance.userId});
            result.courses = Array.isArray(courses) ? courses.slice(0, Lms.LIMITS.courses) : [];
            capabilities.COURSES = "SUPPORTED";
        } catch (error) { capabilities.COURSES = capabilityFromError(error); result.errors.COURSES = error.code; }
        try {
            const assignments = await this.call(READ_FUNCTIONS.ASSIGNMENTS);
            result.assignments = flattenAssignments(assignments).slice(0, Lms.LIMITS.assignments);
            capabilities.ASSIGNMENTS = "SUPPORTED";
        } catch (error) { capabilities.ASSIGNMENTS = capabilityFromError(error); result.errors.ASSIGNMENTS = error.code; }
        try {
            const courseIds = result.courses.slice(0, 20).map(item => Number(item.id)).filter(Number.isFinite);
            const calendar = await this.call(READ_FUNCTIONS.CALENDAR, {events: {courseids: courseIds}});
            result.calendar = Array.isArray(calendar && calendar.events) ? calendar.events.slice(0, Lms.LIMITS.events) : [];
            capabilities.CALENDAR = "SUPPORTED";
        } catch (error) { capabilities.CALENDAR = capabilityFromError(error); result.errors.CALENDAR = error.code; }
        capabilities.ASSIGNMENT_STATUS = capabilities.ASSIGNMENTS === "SUPPORTED" ? "UNKNOWN" : capabilities.ASSIGNMENTS;
        capabilities.FEEDBACK = capabilities.ASSIGNMENTS === "SUPPORTED" ? "UNKNOWN" : capabilities.ASSIGNMENTS;
        capabilities.COURSE_CONTENT = result.courses.length ? "UNKNOWN" : capabilities.COURSES;
        capabilities.RESOURCES = result.courses.length ? "UNKNOWN" : capabilities.COURSES;
        capabilities.GRADES = result.courses.length && result.instance.userId ? "UNKNOWN" : capabilities.COURSES;
        capabilities.COMPLETION = result.courses.length && result.instance.userId ? "UNKNOWN" : capabilities.COURSES;
        capabilities.FORUM_READ = result.courses.length ? "UNKNOWN" : capabilities.COURSES;
        return result;
    }

    async fetchCourseDetail(course, userId, capabilities, errors) {
        const courseId = Number(course.id);
        if (!Number.isFinite(courseId)) return {resources: [], grades: [], completion: []};
        const detail = {resources: [], grades: [], completion: []};
        try {
            const contents = await this.call(READ_FUNCTIONS.COURSE_CONTENT, {courseid: courseId});
            detail.resources = this.normalizeResources(contents, courseId);
            capabilities.COURSE_CONTENT = "SUPPORTED"; capabilities.RESOURCES = "SUPPORTED";
        } catch (error) { capabilities.COURSE_CONTENT = capabilityFromError(error); capabilities.RESOURCES = capabilityFromError(error); errors.COURSE_CONTENT = error.code; }
        if (userId) {
            try { const grades = await this.call(READ_FUNCTIONS.GRADES, {courseid: courseId, userid: userId}); detail.grades = Array.isArray(grades && grades.usergrades) ? grades.usergrades : []; capabilities.GRADES = "SUPPORTED"; }
            catch (error) { capabilities.GRADES = capabilityFromError(error); errors.GRADES = error.code; }
            try { const completion = await this.call(READ_FUNCTIONS.COMPLETION, {courseid: courseId, userid: userId}); detail.completion = completion || null; capabilities.COMPLETION = "SUPPORTED"; }
            catch (error) { capabilities.COMPLETION = capabilityFromError(error); errors.COMPLETION = error.code; }
        }
        return detail;
    }

    normalizeResources(contents, courseId) {
        if (!Array.isArray(contents)) return [];
        const resources = [];
        contents.forEach(section => (Array.isArray(section.modules) ? section.modules : []).forEach(module => {
            const reference = Lms.safeReferenceUrl(module.url, this.baseUrl);
            resources.push({moodleId: String(module.id), courseMoodleId: String(courseId), title: Lms.sanitizeDisplayText(module.name, 240) || "Moodle resource", type: Lms.sanitizeDisplayText(module.modname, 64) || "RESOURCE", url: reference, mimeType: null, moduleContext: Lms.sanitizeDisplayText(section.name, 240)});
        }));
        return resources.slice(0, Lms.LIMITS.resources);
    }

    normalizeCourse(raw) {
        return {moodleId: String(raw.id), title: Lms.sanitizeDisplayText(raw.fullname, 240) || `Moodle course ${raw.id}`, shortName: Lms.sanitizeDisplayText(raw.shortname, 80), code: Lms.sanitizeDisplayText(raw.idnumber, 80), description: Lms.sanitizeDisplayText(raw.summary, 12000), startDate: isoFromUnix(raw.startdate), endDate: isoFromUnix(raw.enddate), status: raw.visible === 0 ? "ARCHIVED" : "ACTIVE"};
    }

    normalizeAssignment(raw) {
        return {moodleId: String(raw.id), courseMoodleId: String(raw.courseid), title: Lms.sanitizeDisplayText(raw.name, 240) || `Moodle assignment ${raw.id}`, description: Lms.sanitizeDisplayText(raw.intro, 12000), releaseDate: isoFromUnix(raw.allowsubmissionsfromdate), dueDate: isoFromUnix(raw.duedate), cutoffDate: isoFromUnix(raw.cutoffdate), status: assignmentStatus(raw.status), submissionStatus: submissionStatus(raw.submissionstatus), submittedAt: isoFromUnix(raw.timemodified), grade: null, gradeMaximum: Number.isFinite(Number(raw.grade)) ? Number(raw.grade) : null, weight: null, feedback: null};
    }

    async sync() {
        const probe = await this.probe();
        const capabilities = {...probe.capabilities};
        const errors = {...probe.errors};
        const courses = probe.courses.map(item => this.normalizeCourse(item));
        const assignments = probe.assignments.map(item => this.normalizeAssignment(item));
        const resources = [];
        const gradeByAssignment = new Map();
        const completion = [];
        const limitedCourses = probe.courses.slice(0, 20);
        for (const course of limitedCourses) {
            const detail = await this.fetchCourseDetail(course, probe.instance.userId, capabilities, errors);
            resources.push(...detail.resources);
            (detail.grades || []).forEach(user => (Array.isArray(user.gradeitems) ? user.gradeitems : []).forEach(item => {
                const instance = String(item.iteminstance || "");
                if (!instance || !/assign/i.test(String(item.itemmodule || ""))) return;
                gradeByAssignment.set(instance, {grade: Number.isFinite(Number(item.graderaw)) ? Number(item.graderaw) : null, gradeMaximum: Number.isFinite(Number(item.grademax)) ? Number(item.grademax) : null, feedback: Lms.sanitizeDisplayText(item.feedback || item.feedbacktext, 12000)});
            }));
            if (detail.completion) completion.push({courseMoodleId: String(course.id), value: detail.completion});
        }
        assignments.forEach(item => { const grade = gradeByAssignment.get(String(item.moodleId)); if (grade) Object.assign(item, grade); });
        if (gradeByAssignment.size) capabilities.FEEDBACK = "SUPPORTED";
        return Object.freeze({instance: probe.instance, capabilities: Lms.normalizeCapabilities(capabilities), errors, courses, assignments, resources: resources.slice(0, Lms.LIMITS.resources), completion, calendar: probe.calendar.map(item => ({uid: String(item.id || item.instance || item.name || ""), courseMoodleId: item.courseid ? String(item.courseid) : null, title: Lms.sanitizeDisplayText(item.name, 240) || "Moodle calendar event", description: Lms.sanitizeDisplayText(item.description, 12000), startDate: isoFromUnix(item.timestart), endDate: isoFromUnix(item.timestart && item.timestart + (Number(item.timeduration) || 0)), url: Lms.safeReferenceUrl(item.url, this.baseUrl)})).slice(0, Lms.LIMITS.events)});
    }
}

module.exports = {MoodleAdapter, READ_FUNCTIONS, capabilityFromError, formEncode, isoFromUnix};
