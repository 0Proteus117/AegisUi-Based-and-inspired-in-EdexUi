# OSINT Domain Query Model

1. The analyst enters exactly one target.
2. AegisUI normalizes it locally and rejects local, private, loopback,
   multicast, reserved, wildcard, CIDR, multi-target and credential-bearing
   inputs before a network request.
3. A public domain can call Google Public DNS through six fixed record queries.
4. A public IP can call RIPEstat Network Info through one fixed request.
5. A DNS-observed address is never followed automatically: the analyst must
   select one address and request network context explicitly.
6. Results are ephemeral until the analyst chooses **ADD TO CASE**.

All provider work is user-initiated, cancellable and bounded. No target history
is written to browser storage or userData.
