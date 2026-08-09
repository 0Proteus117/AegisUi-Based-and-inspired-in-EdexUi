#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Domain = require(path.join(ROOT, "src/classes/workspaces/osintDomainInfrastructure.class.js"));
const Registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const Runtime = require(path.join(ROOT, "src/classes/workspaces/osintProviderRuntime.class.js"));
const Adapters = require(path.join(ROOT, "src/classes/workspaces/osintProviderAdapters.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"));

const failures = [];
function check(key, condition, detail = "OK") { console.log(`${key}: ${condition ? detail : "FAIL"}`); if (!condition) failures.push(`${key} · ${detail}`); }
function response(payload, status = 200) { return {ok: status >= 200 && status < 300, status, headers: {get: () => null}, json: async () => payload}; }
function invalid(value) { try { Domain.normalizeInput(value); return false; } catch (error) { return error.code === "INVALID_INPUT"; } }

async function main() {
    const domain = Domain.normalizeInput("Example.COM");
    const subdomain = Domain.normalizeInput("sub.example.com");
    const ipv4 = Domain.normalizeInput("8.8.8.8");
    const ipv6 = Domain.normalizeInput("2001:4860:4860::8888");
    const url = Domain.normalizeInput("https://example.com/review?x=1");
    check("DOMAIN_VALID_DOMAIN", domain.targetType === "DOMAIN" && domain.normalizedTarget === "example.com");
    check("DOMAIN_VALID_SUBDOMAIN", subdomain.targetType === "DOMAIN");
    check("DOMAIN_VALID_IPV4", ipv4.targetType === "IPv4");
    check("DOMAIN_VALID_IPV6", ipv6.targetType === "IPv6");
    check("DOMAIN_URL_HOST_EXTRACTION", url.targetType === "DOMAIN" && url.normalizedTarget === "example.com" && url.source === "URL_HOSTNAME");
    ["localhost", "127.0.0.1", "10.1.2.3", "192.168.1.1", "203.0.113.7", "::1", "fe80::1", "2001:db8::1", "example.com,example.net", "*.example.com", "8.8.8.0/24", "file:///tmp/a", "https://user:pass@example.com"].forEach((value, index) => check(`DOMAIN_INVALID_${index + 1}`, invalid(value)));

    const dnsProvider = Registry.getProvider("google-public-dns");
    const networkProvider = Registry.getProvider("ripestat-network-info");
    const queries = [];
    const dnsAdapter = new Adapters.GooglePublicDnsAdapter(dnsProvider, {fetchImpl: async url => {
        queries.push(url);
        const type = new URL(url).searchParams.get("type");
        return response({Status: 0, Answer: type === "A" ? [{data: "8.8.8.8"}] : type === "TXT" ? [{data: '"synthetic long but bounded verification text"'}] : []});
    }});
    const dnsContext = Runtime.createQueryContext({providerId: dnsProvider.id, capability: "INFRASTRUCTURE_CONTEXT", userInitiated: true, networkAllowed: true});
    const dns = await dnsAdapter.query(domain, dnsContext);
    check("DOMAIN_DNS_FIXED_ENDPOINT", queries.length === 6 && queries.every(url => url.startsWith(Adapters.GOOGLE_DNS_DOH_ENDPOINT)) && new Set(queries.map(url => new URL(url).searchParams.get("type"))).size === 6);
    check("DOMAIN_DNS_BOUNDED_RECORDS", dns.status === "SUCCESS" && dns.data.records.length === 6 && dns.data.records.every(record => Domain.DNS_RECORD_TYPES.includes(record.type)));
    check("DOMAIN_DNS_NO_RAW_RESPONSE", dns.rawAvailable === false && !Object.prototype.hasOwnProperty.call(dns, "raw"));
    const partialDnsAdapter = new Adapters.GooglePublicDnsAdapter(dnsProvider, {fetchImpl: async url => {
        if (new URL(url).searchParams.get("type") === "TXT") throw new Runtime.ProviderError("TIMEOUT", "Synthetic timeout.");
        return response({Status: 0, Answer: []});
    }});
    const partialDns = await partialDnsAdapter.query(domain, Runtime.createQueryContext({providerId: dnsProvider.id, capability: "INFRASTRUCTURE_CONTEXT", userInitiated: true, networkAllowed: true}));
    check("DOMAIN_DNS_PARTIAL_TYPED", partialDns.status === "PARTIAL" && partialDns.data.records.length === 6 && partialDns.warnings.length === 1 && partialDns.data.records.find(record => record.type === "TXT").values.length === 0);
    const cancelledController = new AbortController();
    cancelledController.abort();
    let cancellationTyped = false;
    try { await dnsAdapter.query(domain, Runtime.createQueryContext({providerId: dnsProvider.id, capability: "INFRASTRUCTURE_CONTEXT", userInitiated: true, networkAllowed: true, abortController: cancelledController})); }
    catch (error) { cancellationTyped = error && error.code === "CANCELLED"; }
    check("DOMAIN_DNS_CANCELLATION", cancellationTyped);
    const malformedDnsAdapter = new Adapters.GooglePublicDnsAdapter(dnsProvider, {fetchImpl: async () => response({Status: 0, Answer: {invalid: true}})});
    let malformedTyped = false;
    try { await malformedDnsAdapter.query(domain, Runtime.createQueryContext({providerId: dnsProvider.id, capability: "INFRASTRUCTURE_CONTEXT", userInitiated: true, networkAllowed: true})); }
    catch (error) { malformedTyped = error && error.code === "NORMALIZATION_FAILED"; }
    check("DOMAIN_DNS_MALFORMED_RESPONSE", malformedTyped);

    const networkAdapter = new Adapters.RIPEstatNetworkInfoAdapter(networkProvider, {fetchImpl: async url => response({data: {resource: "8.8.8.8", prefix: "8.8.8.0/24", asns: [15169]}})});
    const networkContext = Runtime.createQueryContext({providerId: networkProvider.id, capability: "INFRASTRUCTURE_CONTEXT", userInitiated: true, networkAllowed: true});
    const network = await networkAdapter.query(ipv4, networkContext);
    check("DOMAIN_NETWORK_FIXED_ENDPOINT", networkAdapter.buildRequest(ipv4).startsWith(Adapters.RIPESTAT_NETWORK_INFO_ENDPOINT));
    check("DOMAIN_NETWORK_NORMALIZED", network.status === "SUCCESS" && network.data.network.asns[0] === "AS15169" && network.data.network.prefix === "8.8.8.0/24");
    let wrongAdapterBlocked = false;
    try { networkAdapter.validateInput(domain); } catch (error) { wrongAdapterBlocked = error.code === "INVALID_INPUT"; }
    check("DOMAIN_PROVIDER_TARGET_SCOPE", wrongAdapterBlocked);

    const verification = Domain.createVerification({target: domain, dns: dns.data, providerObservations: [{providerId: dnsProvider.id, providerName: dnsProvider.name, type: "PUBLIC_DNS_OVER_HTTPS", observedAt: dns.completedAt, status: dns.status, summary: dns.summary}]});
    check("DOMAIN_VERIFICATION_STATE", verification.verificationStatus === "PARTIALLY_VERIFIED" && verification.confidence === "LOW" && verification.registration.available === false && verification.certificate.available === false);
    const evidenceData = Domain.toEvidenceData(verification, "Synthetic analyst note.");
    const normalized = {providerId: "domain-infrastructure-evidence", capability: "INFRASTRUCTURE_CONTEXT", status: "SUCCESS", queriedAt: verification.createdAt, completedAt: verification.updatedAt, summary: "Synthetic domain context.", data: evidenceData, warnings: [], source: {provider: "Google Public DNS", type: "NORMALIZED_PASSIVE_OBSERVATIONS"}, confidence: verification.confidence};
    const sanitized = Model.sanitizeNormalizedResult(normalized);
    check("DOMAIN_EVIDENCE_SANITIZED", sanitized.data.infrastructure && sanitized.data.infrastructure.normalizedTarget === "example.com" && !Object.prototype.hasOwnProperty.call(sanitized.data, "raw"));
    const redacted = Model.createProviderEvidence({caseId: "case-domain7", normalizedResult: normalized, draft: {title: "Synthetic domain context", summary: "Reviewed passive context.", tags: ["domain"], redactions: ["data.originalInput", "data.infrastructure.normalizedTarget"]}});
    check("DOMAIN_EVIDENCE_REDACTION", !Object.prototype.hasOwnProperty.call(redacted.data, "originalInput") && !Object.prototype.hasOwnProperty.call(redacted.data.infrastructure, "normalizedTarget") && /^[a-f0-9]{64}$/.test(redacted.integrity.value));

    const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
    const domainSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintDomainInfrastructure.class.js"), "utf8");
    const adapterSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintProviderAdapters.class.js"), "utf8");
    check("DOMAIN_NO_STORAGE", !/localStorage|sessionStorage|indexedDB|ipc\.invoke|fs\.write/.test(domainSource));
    check("DOMAIN_NO_NEW_IPC", !/ipc\.invoke\(\s*["']osint-domain-|ipcMain\.handle\(\s*["']osint-domain-/.test(manager));
    check("DOMAIN_NO_MAP_MUTATION", !/mapManager|\.flyTo\(|\.setView\(|map\.set/i.test(manager.match(/getOSINTDomainInfrastructureModule[\s\S]*?handleOSINTGeoAction/)?.[0] || ""));
    check("DOMAIN_NO_GENERIC_PROXY", !/forwardUrl|arbitraryUrl|renderer.*headers|generic.*proxy/i.test(adapterSource));
    check("DOMAIN_UI_LOAD_ORDER", fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8").indexOf("osintDomainInfrastructure.class.js") < fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8").indexOf("osintProviderAdapters.class.js"));
    const workspaceStyles = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
    const domainContentRule = workspaceStyles.match(/\.engineering-mode \.osint-domain-query \.workspace-panel-content,[\s\S]*?\.engineering-mode \.osint-domain-policy \.workspace-panel-content\s*\{([\s\S]*?)\n\}/);
    check("DOMAIN_UI_LAYOUT_FLOW", /osint-domain-header/.test(manager) && /osint-domain-records/.test(workspaceStyles));
    check("DOMAIN_UI_CONTENT_NORMAL_FLOW", Boolean(domainContentRule) && /position:\s*relative/.test(domainContentRule[1]) && /inset:\s*auto/.test(domainContentRule[1]) && /min-height:\s*min-content/.test(domainContentRule[1]));
    console.log(`OSINT_DOMAIN_INFRASTRUCTURE: ${failures.length ? "FAIL" : "OK"}`);
}

main().catch(error => { failures.push(error.stack || error.message); console.error(error.stack || error.message); }).finally(() => {
    if (failures.length) { failures.forEach(item => console.error(`- ${item}`)); process.exitCode = 1; }
});
