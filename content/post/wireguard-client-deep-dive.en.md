---
title: "WireGuard: The Most Elegant VPN Ever Built"
date: 2026-05-04T12:00:00+01:00
author: "Ilya Brin"
categories: ['security', 'networking', 'vpn']
tags: ['wireguard', 'vpn', 'privacy', 'security', 'networking', 'linux', 'cryptography']
---

Hey, paranoid friend! 👋

**WireGuard** isn't just another VPN protocol. It's a **reimagining of what network code should look like**: ~4,000 lines versus 400,000 in OpenVPN. Less code = fewer vulnerabilities = smaller attack surface.

But most WireGuard articles are just "copy this config and run" tutorials. Today we're going deep: **how it works under the hood**, **which parameters actually matter for privacy and speed**, and **why Linus Torvalds called it a work of art**.

<!--more-->

## 1. Why WireGuard Is an Engineering Breakthrough

### Size matters

Let's look at the numbers:

```
Protocol           Lines of Code    Security Audit
────────────────────────────────────────────────────
OpenVPN            ~400,000         Hard, expensive
IPsec/StrongSwan   ~200,000         Very hard
OpenSSH            ~150,000         Regular
WireGuard          ~4,000           Easy, conducted
────────────────────────────────────────────────────
```

In 2020, WireGuard was **merged into Linux kernel 5.6**. Linus Torvalds wrote:

> "Can I just once again state my love for it and hope it gets merged soon? Maybe the code isn't perfect, but I've skimmed it, and compared to the horrors that are OpenVPN and IPSec, it's a work of art."

This isn't marketing. It's an **architectural decision** - take the minimum set of battle-tested cryptographic primitives, and add nothing else.

### The opinionated design principle

WireGuard **gives you no choice** of encryption algorithms. And that's a feature, not a bug:

```
Component          Algorithm             Why
───────────────────────────────────────────────────────────
Key exchange       Curve25519            Fast, secure
Encryption         ChaCha20-Poly1305     No padding oracle
Hashing            BLAKE2s               Faster than SHA-256
Key derivation     HKDF                  RFC 5869
───────────────────────────────────────────────────────────
```

IPsec offers dozens of algorithm combinations - and every misconfiguration opens a vulnerability. WireGuard says: **"You have no choice, because we already chose the best."**

## 2. How WireGuard Works Internally

### Handshake: 1-RTT authentication

```
Client                                    Server
  |                                          |
  |  Initiator Handshake Message             |
  |  - Ephemeral public key (Curve25519)     |
  |  - Encrypted static public key           |
  |  - Encrypted timestamp                   |
  |---------------------------------------->|
  |                                          |
  |  Responder Handshake Message             |
  |  - Ephemeral public key                  |
  |  - Empty encrypted payload               |
  |<----------------------------------------|
  |                                          |
  |  ======= Encrypted Data (ChaCha20) ====>|
  |                                          |

Time: 1 round-trip (RTT)
Session keys rotate every 3 minutes or 2^64 packets
```

**What matters:** WireGuard uses the **Noise Protocol Framework** - a formally verified key exchange protocol. This isn't homebrew cryptography.

### The identity model

Instead of certificates, CA, PKI - **just public key pairs**:

```ini
# Each peer is simply a public key
[Peer]
PublicKey = <base64-encoded-curve25519-public-key>
AllowedIPs = 10.0.0.2/32
```

The server knows the client by public key. The client knows the server by public key. **No certificates, no CA, no OCSP**.

### Roaming out of the box

```
  Phone                                VPN Server
     |                                     |
     | UDP packet from IP 192.168.1.10     |
     |------------------------------------>|
     |                                     | Remembers endpoint
     | Switch to LTE                       |
     |                                     |
     | UDP packet from IP 10.20.30.40      |
     |------------------------------------>|
     |                                     | Updates endpoint automatically
     |<====================================>|

WireGuard doesn't drop connections on IP changes
```

## 3. Privacy Parameters: What Actually Matters

### PrivateKey and PublicKey

```ini
[Interface]
PrivateKey = <your-private-key>
Address = 10.0.0.1/24
```

**The private key is everything.** Whoever holds it - that's "you" in the WireGuard network.

```bash
# Generate keys
wg genkey | tee privatekey | wg pubkey > publickey

# Check private key file permissions
chmod 600 /etc/wireguard/privatekey
```

**What can go wrong:** if your private key leaks - rotate it. Past sessions won't be compromised (forward secrecy), but the attacker can impersonate you going forward.

### DNS: the Achilles' heel of most VPNs

```ini
[Interface]
PrivateKey = ...
Address = 10.0.0.1/24
DNS = 1.1.1.1          # ← This parameter is critical
```

**Without `DNS` in the config** - your traffic goes through the VPN, but DNS queries can leak to your ISP. This is a **DNS leak**.

```
Without DNS in config:
  DNS query → ISP (leaked!)
  Traffic → WireGuard → server ✓

With DNS = 10.0.0.53:
  DNS query → VPN tunnel → your DNS resolver ✓
  Traffic → WireGuard → server ✓
```

**Best practice:** run your own DNS (Unbound, AdGuard Home) on the VPN server and point to its internal IP.

### AllowedIPs: traffic routing

```ini
[Peer]
PublicKey = ...
AllowedIPs = 0.0.0.0/0, ::/0    # All traffic through VPN (full tunnel)

# Or:
AllowedIPs = 192.168.1.0/24     # Corporate network only (split tunnel)
```

**Privacy difference:**

```
Full tunnel (0.0.0.0/0):
  All traffic → VPN server
  ISP sees: server IP only, traffic volume
  Downside: speed depends on server

Split tunnel (specific subnets):
  Some traffic → VPN
  Some traffic → direct
  ISP sees direct connections
  Upside: faster for local traffic
```

### PersistentKeepalive: invisibility vs connection

```ini
[Peer]
PublicKey = ...
PersistentKeepalive = 25    # Send keepalive every 25 seconds
```

**By default** WireGuard **sends zero packets** when there's no traffic. Great news for privacy - the tunnel is invisible when idle.

**But there's a catch:** if you're behind NAT (router, corporate firewall), the connection may drop. `PersistentKeepalive = 25` fixes this.

```
Without PersistentKeepalive:
  No traffic → no packets → NAT table expires → tunnel dies
  Upside: invisible when idle

With PersistentKeepalive = 25:
  Every 25 seconds → 1 UDP packet → NAT stays alive
  Downside: activity visible by traffic pattern
```

**Rule of thumb:** for mobile devices and NAT environments - use 25. For server-to-server with direct IP - skip it.

### PreSharedKey: extra layer of protection

```ini
[Peer]
PublicKey = ...
PresharedKey = <32-byte-symmetric-key>    # Optional
AllowedIPs = 0.0.0.0/0
```

**Post-quantum protection:** Curve25519 is theoretically vulnerable to quantum computers. PresharedKey adds a symmetric layer on top of the asymmetric exchange - if a quantum computer breaks Curve25519, PresharedKey still protects your traffic.

```bash
# Generate PresharedKey
wg genpsk
```

**Use it or not:** if paranoia is high - yes. For everyday use - optional.

## 4. Speed Parameters: What Actually Matters

### MTU: the most underrated parameter

```ini
[Interface]
PrivateKey = ...
Address = 10.0.0.1/24
MTU = 1420    # ← People often forget this
```

**Why it matters:**

```
Standard Ethernet MTU: 1500 bytes
WireGuard overhead:
  - UDP header: 8 bytes
  - IP header: 20 bytes (IPv4) or 40 bytes (IPv6)
  - WireGuard header: 32 bytes
  ─────────────────────────────────────────
  Total overhead: 60 bytes (IPv4)

Optimal MTU for WireGuard over IPv4:
  1500 - 60 = 1440 bytes

With margin (for tunnel-over-tunnel scenarios):
  MTU = 1380-1420 bytes
```

**Symptom of wrong MTU:** websites load, but large files don't download. Video buffers forever. SSH works but `scp` hangs.

```bash
# Diagnose MTU
ping -M do -s 1400 <vpn-server-ip>
# Increase -s until packets start dropping
```

### ListenPort: UDP by design

```ini
[Interface]
ListenPort = 51820    # Default
```

WireGuard runs **UDP only**. This is an intentional decision:

```
UDP:
  ✓ No connection establishment overhead
  ✓ No head-of-line blocking
  ✓ No transport-level retransmissions
  ✓ WireGuard manages reliability itself

TCP:
  ✗ Double TCP ack overhead (VPN over TCP)
  ✗ TCP-over-TCP problem: retry storms
  ✗ Higher latency
```

**If UDP is blocked** (corporate firewall): use `udp2raw` or `wstunnel` to wrap WireGuard in TCP/WebSocket. But treat this as a last resort.

### Hardware-level encryption

ChaCha20-Poly1305 was deliberately chosen for **excellent software performance without hardware acceleration**:

```
CPU without AES-NI (older ARM):
  AES-GCM (OpenVPN): ~200 Mbps
  ChaCha20 (WireGuard): ~800 Mbps  ← 4x faster

CPU with AES-NI (modern x86/ARM):
  AES-GCM (OpenVPN): ~1 Gbps
  ChaCha20 (WireGuard): ~1.2 Gbps  ← comparable
```

**Takeaway:** on mobile devices (ARM without AES-NI), WireGuard is **significantly faster** than OpenVPN. On servers - roughly equivalent.

## 5. Full Config with Explanations

### Client config

```ini
[Interface]
# Private key - keep it safe
PrivateKey = <client-private-key>

# Client's IP address in the VPN network
Address = 10.0.0.2/32

# DNS - critical for preventing leaks
DNS = 10.0.0.1

# MTU - speed optimization
MTU = 1420

# Optional: run commands on connect/disconnect
# PostUp = echo "WireGuard connected" | logger
# PreDown = echo "WireGuard disconnecting" | logger

[Peer]
# Server's public key
PublicKey = <server-public-key>

# Extra protection layer (optional)
PresharedKey = <preshared-key>

# Server endpoint: IP:port
Endpoint = vpn.example.com:51820

# 0.0.0.0/0 = all IPv4 traffic through VPN
# ::/0 = all IPv6 traffic through VPN
AllowedIPs = 0.0.0.0/0, ::/0

# Keepalive for NAT (needed if you're behind a router)
PersistentKeepalive = 25
```

### Split tunnel config (work network only)

```ini
[Interface]
PrivateKey = <client-private-key>
Address = 10.0.0.2/32
MTU = 1420
# No DNS - use local resolver for internet traffic

[Peer]
PublicKey = <server-public-key>
Endpoint = office-vpn.example.com:51820

# Only corporate subnets
AllowedIPs = 192.168.1.0/24, 10.0.0.0/8
# Internet traffic goes direct - maximum speed

PersistentKeepalive = 25
```

## 6. Comparison with Competitors

```
Parameter             WireGuard    OpenVPN      IPsec
──────────────────────────────────────────────────────────
Lines of code         ~4,000       ~400,000     ~200,000
Handshake latency     1-RTT        2-RTT        2-RTT
Encryption            ChaCha20     AES/RC4      AES
Authentication        Public key   PKI/PSK      PKI/PSK
UDP support           UDP only     UDP + TCP    UDP
Linux kernel          Yes (5.6+)   Userspace    Built-in
Code audit            Easy         Hard         Very hard
Mobile battery        Excellent    Poor         Good
Setup time            Minutes      Hours/days   Days
──────────────────────────────────────────────────────────
```

## 7. Troubleshooting: When It Doesn't Work

### Common problems and solutions

```bash
# Check tunnel status
sudo wg show

# Output:
# interface: wg0
#   public key: ...
#   private key: (hidden)
#   listening port: 51820
#
# peer: <server-pubkey>
#   endpoint: 1.2.3.4:51820
#   allowed ips: 0.0.0.0/0
#   latest handshake: 23 seconds ago    ← This is a good sign
#   transfer: 1.23 GiB received, 456 MiB sent

# Problem: no handshake
# Cause: firewall blocking UDP port
# Fix:
sudo ufw allow 51820/udp

# Problem: handshake works but no traffic
# Cause: IP forwarding disabled on server
# Fix (on server):
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p

# Problem: DNS leaks
# Check:
curl https://dnsleaktest.com/test
```

### Real-time tunnel monitoring

```bash
# Watch stats every second
watch -n 1 sudo wg show

# Or via system journal
journalctl -fu wg-quick@wg0
```

## 8. Key Security: Don't Step on These Rakes

### Key rotation

```bash
# Key rotation script (run via cron)
#!/bin/bash
NEW_PRIVATE=$(wg genkey)
NEW_PUBLIC=$(echo $NEW_PRIVATE | wg pubkey)

# Update config
wg set wg0 private-key <(echo $NEW_PRIVATE)

# Save new private key
echo $NEW_PRIVATE > /etc/wireguard/privatekey
chmod 600 /etc/wireguard/privatekey

echo "New public key: $NEW_PUBLIC"
# Now update PublicKey on the server!
```

### Config storage

```bash
# Never store WireGuard config in git unencrypted
# Use age or GPG:
age -e -r <your-age-public-key> wg0.conf > wg0.conf.age

# Config file permissions
chmod 600 /etc/wireguard/wg0.conf
chown root:root /etc/wireguard/wg0.conf
```

## Conclusion: Why WireGuard Matters

WireGuard matters not because it's "a fast VPN." It matters because it **proves a principle**: complex problems can be solved with simple code. 4,000 lines that are auditable, understandable, and secure - are worth more than 400,000 lines that no one can fully review.

**Privacy parameters (in order of importance):**
🔑 **PrivateKey** - keep it secret, rotate regularly  
🌐 **DNS** - mandatory, otherwise you're leaking  
🛡️ **AllowedIPs = 0.0.0.0/0** - full tunnel for maximum privacy  
🔒 **PresharedKey** - for the post-quantum paranoid  

**Speed parameters:**
⚡ **MTU = 1420** - always set this  
📡 **UDP** - don't try to replace with TCP unless absolutely forced  
🔄 **PersistentKeepalive = 25** - for NAT environments  

**Golden rule:**
> WireGuard doesn't make you anonymous. It encrypts traffic between you and the server. What the server does with your traffic is a different question. Choose your VPN provider as carefully as you choose your doctor.

**P.S. Using WireGuard? Share your config setup (without keys, obviously) in the comments!** 🚀

```bash
# Additional resources:
# - WireGuard Paper: https://www.wireguard.com/papers/wireguard.pdf
# - Noise Protocol Framework: https://noiseprotocol.org/
# - Linux Kernel inclusion: https://lkml.org/lkml/2019/12/8/16
```
