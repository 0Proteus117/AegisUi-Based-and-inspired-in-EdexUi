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

function positiveGradeMaximum(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
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

function normalizedSubmissionObservation(payload = {}) {
    const attempt = payload && payload.lastattempt && payload.lastattempt.submission || {};
    const rawStatus = String(attempt.status || payload && payload.status || "").toUpperCase();
    const graded = String(payload && payload.lastattempt && payload.lastattempt.gradingstatus || "").toUpperCase();
    const normalizedSubmissionStatus = submissionStatus(rawStatus);
    return Object.freeze({
        submissionStatus: normalizedSubmissionStatus,
        // Some Moodle installations report gradingstatus=graded for an empty
        // attempt. That describes the grading workflow, not proof that this
        // student submitted or received a grade.
        assignmentStatus: normalizedSubmissionStatus === "SUBMITTED" && graded.includes("GRADED") ? "GRADED" : null,
        submittedAt: normalizedSubmissionStatus === "SUBMITTED" ? isoFromUnix(attempt.timemodified) : null,
        feedback: Lms.sanitizeDisplayText(payload && payload.feedback && payload.feedback.grade || "", 12000) || null
    });
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
    safeFileUrl(value) { return Lms.safeMoodleFileUrl(value, this.baseUrl); }

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

    async downloadResourceFile(resource = {}) {
        const url = Lms.safeMoodleFileUrl(resource.downloadUrl, this.baseUrl);
        if (!url) throw new Lms.LmsError("POLICY_BLOCKED", "Moodle resource is not an approved same-instance Web Service file.");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error("timeout")), this.timeoutMs);
        this.controllers.set(this.requestId, controller);
        try {
            // Moodle's Web Service pluginfile endpoint accepts the token as a
            // transient query value. It is constructed only in memory and the
            // resulting URL is never returned, logged or persisted.
            const authenticated = new URL(url);
            authenticated.searchParams.set("token", this.token);
            const response = await this.fetch(authenticated.toString(), {
                method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
                headers: {accept: "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1"}, signal: controller.signal
            });
            if (response.status === 429) throw new Lms.LmsError("RATE_LIMITED", "Moodle rate-limited this explicit file download.");
            if (!response.ok) throw new Lms.LmsError("SERVER_ERROR", `Moodle file download returned HTTP ${response.status}.`);
            const declared = Number(response.headers && response.headers.get && response.headers.get("content-length"));
            if (Number.isFinite(declared) && declared > Lms.LIMITS.fileBytes) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle file exceeds the permitted size.");
            const bytes = Buffer.from(await response.arrayBuffer());
            if (!bytes.length || bytes.length > Lms.LIMITS.fileBytes) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle file exceeds the permitted size.");
            const contentType = Lms.sanitizeDisplayText(String(response.headers && response.headers.get && response.headers.get("content-type") || "").split(";", 1)[0], 120);
            return Object.freeze({bytes, mimeType: contentType || resource.mimeType || "application/octet-stream"});
        } catch (error) {
            if (error instanceof Lms.LmsError) throw error;
            if (controller.signal.aborted) throw new Lms.LmsError("CANCELLED", "Moodle file download was cancelled.");
            if (error && /timeout/i.test(String(error.message || ""))) throw new Lms.LmsError("TIMEOUT", "Moodle file did not respond within the bounded timeout.");
            throw new Lms.LmsError("OFFLINE", "Moodle file could not be reached from this device.");
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
            const courseIds = result.courses.map(item => Number(item.id)).filter(Number.isFinite);
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

    async fetchAssignmentStatus(assignment, capabilities, errors) {
        const assignmentId = Number(assignment && assignment.id);
        if (!Number.isFinite(assignmentId)) return null;
        try {
            const payload = await this.call(READ_FUNCTIONS.ASSIGNMENT_STATUS, {assignid: assignmentId});
            capabilities.ASSIGNMENT_STATUS = "SUPPORTED";
            const observation = normalizedSubmissionObservation(payload);
            if (observation.feedback) capabilities.FEEDBACK = "SUPPORTED";
            return observation;
        } catch (error) {
            capabilities.ASSIGNMENT_STATUS = capabilityFromError(error);
            if (capabilities.FEEDBACK === "UNKNOWN") capabilities.FEEDBACK = capabilityFromError(error);
            errors.ASSIGNMENT_STATUS = error.code;
            return null;
        }
    }

    async fetchForums(courseIds, capabilities, errors) {
        if (!courseIds.length) return [];
        try {
            const payload = await this.call(READ_FUNCTIONS.FORUM_READ, {courseids: courseIds});
            const forums = Array.isArray(payload) ? payload : Array.isArray(payload && payload.forums) ? payload.forums : [];
            capabilities.FORUM_READ = "SUPPORTED";
            // A Moodle "news" forum is an institutional announcement
            // container. We preserve its public course metadata only; no posts,
            // participants or private discussion content is fetched here.
            capabilities.ANNOUNCEMENTS = forums.some(item => String(item.type || "").toLowerCase() === "news") ? "SUPPORTED" : "UNKNOWN";
            return forums.slice(0, Lms.LIMITS.resources).map(item => ({
                moodleId: `forum:${String(item.id)}`,
                courseMoodleId: String(item.course || item.courseid || ""),
                assignmentMoodleId: null,
                title: Lms.sanitizeDisplayText(item.name, 240) || "Moodle forum",
                type: String(item.type || "").toLowerCase() === "news" ? "ANNOUNCEMENTS" : "FORUM",
                url: Lms.safeReferenceUrl(item.url, this.baseUrl),
                mimeType: null,
                moduleContext: "MOODLE COURSE FORUM"
            })).filter(item => item.courseMoodleId);
        } catch (error) {
            capabilities.FORUM_READ = capabilityFromError(error);
            capabilities.ANNOUNCEMENTS = capabilityFromError(error);
            errors.FORUM_READ = error.code;
            return [];
        }
    }

    normalizeResources(contents, courseId) {
        if (!Array.isArray(contents)) return [];
        const resources = [];
        contents.forEach(section => (Array.isArray(section.modules) ? section.modules : []).forEach(module => {
            const reference = Lms.safeReferenceUrl(module.url, this.baseUrl);
            const moduleContext = Lms.sanitizeDisplayText(section.name, 240);
            const assignmentMoodleId = String(module.modname || "").toLowerCase() === "assign" && Number.isFinite(Number(module.instance)) ? String(module.instance) : null;
            const contents = Array.isArray(module.contents) ? module.contents : [];
            if (!contents.length) {
                resources.push({moodleId: String(module.id), courseMoodleId: String(courseId), assignmentMoodleId, title: Lms.sanitizeDisplayText(module.name, 240) || "Moodle resource", type: Lms.sanitizeDisplayText(module.modname, 64) || "RESOURCE", url: reference, mimeType: null, moduleContext});
                return;
            }
            contents.forEach((content, index) => {
                const fileName = Lms.sanitizeDisplayText(content.filename || content.filepath || `Moodle file ${index + 1}`, 240) || `Moodle file ${index + 1}`;
                const fileUrl = this.safeFileUrl(content.fileurl);
                resources.push({
                    moodleId: `${String(module.id)}:${String(content.id || content.contenthash || index)}`,
                    courseMoodleId: String(courseId), assignmentMoodleId, title: fileName,
                    type: "FILE", url: reference, mimeType: Lms.sanitizeDisplayText(content.mimetype, 120),
                moduleContext, fileSize: Number(content.filesize) || null,
                    contentHash: /^[a-f0-9]{32,128}$/i.test(String(content.contenthash || "")) ? String(content.contenthash).toLowerCase() : null,
                    downloadUrl: fileUrl
                });
            });
        }));
        return resources.slice(0, Lms.LIMITS.resources);
    }

    normalizeCourse(raw) {
        return {moodleId: String(raw.id), title: Lms.sanitizeDisplayText(raw.fullname, 240) || `Moodle course ${raw.id}`, shortName: Lms.sanitizeDisplayText(raw.shortname, 80), code: Lms.sanitizeDisplayText(raw.idnumber, 80), description: Lms.sanitizeDisplayText(raw.summary, 12000), startDate: isoFromUnix(raw.startdate), endDate: isoFromUnix(raw.enddate), status: raw.visible === 0 ? "ARCHIVED" : "ACTIVE"};
    }

    normalizeAssignment(raw) {
        // Assignment timemodified describes the activity configuration, not
        // this student's submission. Only the dedicated submission-status
        // endpoint may populate submittedAt.
        return {moodleId: String(raw.id), courseMoodleId: String(raw.courseid), title: Lms.sanitizeDisplayText(raw.name, 240) || `Moodle assignment ${raw.id}`, description: Lms.sanitizeDisplayText(raw.intro, 12000), releaseDate: isoFromUnix(raw.allowsubmissionsfromdate), dueDate: isoFromUnix(raw.duedate), cutoffDate: isoFromUnix(raw.cutoffdate), status: assignmentStatus(raw.status), submissionStatus: submissionStatus(raw.submissionstatus), submittedAt: null, grade: null, gradeMaximum: positiveGradeMaximum(raw.grade), weight: null, feedback: null};
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
        for (const course of probe.courses) {
            const detail = await this.fetchCourseDetail(course, probe.instance.userId, capabilities, errors);
            resources.push(...detail.resources);
            (detail.grades || []).forEach(user => (Array.isArray(user.gradeitems) ? user.gradeitems : []).forEach(item => {
                const instance = String(item.iteminstance || "");
                if (!instance || !/assign/i.test(String(item.itemmodule || ""))) return;
                const gradeMaximum = positiveGradeMaximum(item.grademax);
                gradeByAssignment.set(instance, {grade: gradeMaximum !== null && Number.isFinite(Number(item.graderaw)) ? Number(item.graderaw) : null, gradeMaximum, feedback: Lms.sanitizeDisplayText(item.feedback || item.feedbacktext, 12000)});
            }));
            if (detail.completion) completion.push({courseMoodleId: String(course.id), value: detail.completion});
        }
        const forums = await this.fetchForums(probe.courses.map(item => Number(item.id)).filter(Number.isFinite), capabilities, errors);
        resources.push(...forums);
        for (const assignment of probe.assignments.slice(0, Lms.LIMITS.assignments)) {
            const status = await this.fetchAssignmentStatus(assignment, capabilities, errors);
            if (!status) continue;
            const normalized = assignments.find(item => item.moodleId === String(assignment.id));
            if (normalized) {
                if (status.submissionStatus && status.submissionStatus !== "UNKNOWN") normalized.submissionStatus = status.submissionStatus;
                // A known NOT_SUBMITTED observation must clear any stale
                // timestamp imported by older builds.
                if (status.submissionStatus && status.submissionStatus !== "UNKNOWN") normalized.submittedAt = status.submittedAt || null;
                if (status.feedback) normalized.feedback = status.feedback;
                if (status.assignmentStatus) normalized.status = status.assignmentStatus;
            }
        }
        assignments.forEach(item => { const grade = gradeByAssignment.get(String(item.moodleId)); if (grade) Object.assign(item, grade); });
        if (gradeByAssignment.size) capabilities.FEEDBACK = "SUPPORTED";
        capabilities.FILES = resources.some(item => item.downloadUrl) ? "SUPPORTED" : capabilities.RESOURCES === "SUPPORTED" ? "UNSUPPORTED" : capabilities.RESOURCES;
        return Object.freeze({instance: probe.instance, capabilities: Lms.normalizeCapabilities(capabilities), errors, courses, assignments, resources: resources.slice(0, Lms.LIMITS.resources), completion, calendar: probe.calendar.map(item => ({uid: String(item.id || item.instance || item.name || ""), courseMoodleId: item.courseid ? String(item.courseid) : null, title: Lms.sanitizeDisplayText(item.name, 240) || "Moodle calendar event", description: Lms.sanitizeDisplayText(item.description, 12000), startDate: isoFromUnix(item.timestart), endDate: isoFromUnix(item.timestart && item.timestart + (Number(item.timeduration) || 0)), url: Lms.safeReferenceUrl(item.url, this.baseUrl)})).slice(0, Lms.LIMITS.events)});
    }
}

module.exports = {MoodleAdapter, READ_FUNCTIONS, capabilityFromError, formEncode, isoFromUnix, normalizedSubmissionObservation};
