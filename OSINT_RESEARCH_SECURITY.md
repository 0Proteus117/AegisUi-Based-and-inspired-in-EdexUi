# OSINT research security and privacy

This capability is fail-closed:

- accepts one public URL, DOI or selected PDF only;
- rejects private/local URLs, credentials, custom ports and non-HTTP schemes;
- exposes no generic HTTP proxy, renderer headers or renderer methods;
- provides no crawler, downloader, OCR, paywall bypass, login automation or
  external upload of local documents;
- adds no IPC, shell command or filesystem bridge;
- creates no hidden localStorage/sessionStorage/userData source history.

`REFERENCE_ONLY` policy remains authoritative and cannot enter a native query
path. Public release validation uses synthetic data only.
