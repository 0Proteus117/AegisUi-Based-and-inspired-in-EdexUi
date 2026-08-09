# OSINT Infrastructure Security

The Phase 7 capability is passive and fail-closed.

- No generic HTTP proxy or arbitrary URL request API.
- No renderer-controlled headers or HTTP methods.
- No account, cookie, key or credential input.
- No shell or command execution.
- No port scan, service probing, vulnerability detection, directory enumeration,
  crawler, zone transfer, wildcard expansion, subdomain brute force, CIDR or
  batch mode.
- No automatic follow-up from discovered DNS values.
- No global map mutation.
- No target history, raw response or background polling.

`REFERENCE_ONLY` policy remains enforced before any operational adapter or
network action can be reached.
