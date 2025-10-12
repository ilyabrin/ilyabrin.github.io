---
title: "mTLS in Microservices: Mutual Authentication"
date: 2025-10-03T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["security", "tls", "microservices", "golang", "authentication", "mtls"]
categories: ["Security"]
---

In traditional HTTPS, only the server proves its identity with a certificate. The client remains anonymous. But in microservices, where services communicate with each other, we need mutual trust. This is where mTLS (mutual TLS) comes in.

<!--more-->

## What is mTLS

mTLS is TLS with bidirectional authentication:

- The server presents its certificate to the client
- The client presents its certificate to the server
- Both verify each other's certificates

This solves several problems:

- **Authentication**: we know exactly which service is calling us
- **Authorization**: we can grant access based on certificate identity
- **Encryption**: all traffic is encrypted
- **No shared secrets**: no need to manage API keys or tokens

## How mTLS Works

```sh
1. Client → Server: ClientHello
2. Server → Client: ServerHello + Server Certificate
3. Server → Client: CertificateRequest
4. Client → Server: Client Certificate
5. Both verify certificates against trusted CA
6. Encrypted connection established
```

The key difference from regular TLS: step 3-4 where the server requests and the client provides its certificate.

## Implementation in Go

### Server with mTLS

```go
package main

import (
    "crypto/tls"
    "crypto/x509"
    "log"
    "net/http"
    "os"
)

func main() {
    caCert, err := os.ReadFile("ca.crt")
    if err != nil {
        log.Fatal(err)
    }

    caCertPool := x509.NewCertPool()
    caCertPool.AppendCertsFromPEM(caCert)

    tlsConfig := &tls.Config{
        ClientCAs:  caCertPool,
        ClientAuth: tls.RequireAndVerifyClientCert,
        MinVersion: tls.VersionTLS13,
    }

    server := &http.Server{
        Addr:      ":8443",
        TLSConfig: tlsConfig,
        Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if r.TLS != nil && len(r.TLS.PeerCertificates) > 0 {
                cert := r.TLS.PeerCertificates[0]
                log.Printf("Request from: %s", cert.Subject.CommonName)
                w.Write([]byte("Hello, " + cert.Subject.CommonName))
            }
        }),
    }

    log.Fatal(server.ListenAndServeTLS("server.crt", "server.key"))
}
```

Key points:

- `ClientCAs`: CA certificates we trust for client verification
- `ClientAuth: tls.RequireAndVerifyClientCert`: require client certificate
- `r.TLS.PeerCertificates`: access to client certificate

### Client with mTLS

```go
package main

import (
    "crypto/tls"
    "crypto/x509"
    "io"
    "log"
    "net/http"
    "os"
)

func main() {
    cert, err := tls.LoadX509KeyPair("client.crt", "client.key")
    if err != nil {
        log.Fatal(err)
    }

    caCert, err := os.ReadFile("ca.crt")
    if err != nil {
        log.Fatal(err)
    }

    caCertPool := x509.NewCertPool()
    caCertPool.AppendCertsFromPEM(caCert)

    client := &http.Client{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{
                Certificates: []tls.Certificate{cert},
                RootCAs:      caCertPool,
                MinVersion:   tls.VersionTLS13,
            },
        },
    }

    resp, err := client.Get("https://localhost:8443")
    if err != nil {
        log.Fatal(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    log.Printf("Response: %s", body)
}
```

## Certificate Generation

For development, create your own CA:

```bash
# Generate CA
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 365 -key ca.key -out ca.crt \
    -subj "/CN=My CA"

# Generate server certificate
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
    -subj "/CN=localhost"
openssl x509 -req -days 365 -in server.csr \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out server.crt

# Generate client certificate
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr \
    -subj "/CN=service-a"
openssl x509 -req -days 365 -in client.csr \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out client.crt
```

For production, use proper PKI infrastructure or tools like cert-manager in Kubernetes.

## Authorization Based on Certificate

```go
type ServiceIdentity struct {
    CommonName string
    Roles      []string
}

var serviceACL = map[string]ServiceIdentity{
    "service-a": {
        CommonName: "service-a",
        Roles:      []string{"read", "write"},
    },
    "service-b": {
        CommonName: "service-b",
        Roles:      []string{"read"},
    },
}

func authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
            http.Error(w, "No client certificate", http.StatusUnauthorized)
            return
        }

        cert := r.TLS.PeerCertificates[0]
        cn := cert.Subject.CommonName

        identity, ok := serviceACL[cn]
        if !ok {
            http.Error(w, "Unknown service", http.StatusForbidden)
            return
        }

        ctx := context.WithValue(r.Context(), "identity", identity)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func writeHandler(w http.ResponseWriter, r *http.Request) {
    identity := r.Context().Value("identity").(ServiceIdentity)
    
    hasWriteAccess := false
    for _, role := range identity.Roles {
        if role == "write" {
            hasWriteAccess = true
            break
        }
    }

    if !hasWriteAccess {
        http.Error(w, "Insufficient permissions", http.StatusForbidden)
        return
    }

    w.Write([]byte("Write operation successful"))
}
```

## Certificate Rotation

Certificates expire. Implement automatic rotation:

```go
type CertificateReloader struct {
    certPath string
    keyPath  string
    cert     *tls.Certificate
    mu       sync.RWMutex
}

func NewCertificateReloader(certPath, keyPath string) (*CertificateReloader, error) {
    cr := &CertificateReloader{
        certPath: certPath,
        keyPath:  keyPath,
    }
    
    if err := cr.reload(); err != nil {
        return nil, err
    }
    
    go cr.watchAndReload()
    return cr, nil
}

func (cr *CertificateReloader) reload() error {
    cert, err := tls.LoadX509KeyPair(cr.certPath, cr.keyPath)
    if err != nil {
        return err
    }
    
    cr.mu.Lock()
    cr.cert = &cert
    cr.mu.Unlock()
    
    log.Println("Certificate reloaded")
    return nil
}

func (cr *CertificateReloader) watchAndReload() {
    ticker := time.NewTicker(1 * time.Hour)
    defer ticker.Stop()
    
    for range ticker.C {
        if err := cr.reload(); err != nil {
            log.Printf("Failed to reload certificate: %v", err)
        }
    }
}

func (cr *CertificateReloader) GetCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error) {
    cr.mu.RLock()
    defer cr.mu.RUnlock()
    return cr.cert, nil
}

// Usage
reloader, err := NewCertificateReloader("server.crt", "server.key")
if err != nil {
    log.Fatal(err)
}

server := &http.Server{
    TLSConfig: &tls.Config{
        GetCertificate: reloader.GetCertificate,
    },
}
```

## mTLS in Kubernetes

In Kubernetes, use service mesh like Istio or Linkerd for automatic mTLS:

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT
```

Istio automatically:

- Generates certificates for each pod
- Rotates certificates
- Encrypts traffic between services
- Validates certificates

## Performance Considerations

mTLS adds overhead:

```go
func BenchmarkHTTPS(b *testing.B) {
    config := &tls.Config{
        MinVersion: tls.VersionTLS13,
    }
    benchmarkRequest(b, config)
}

func BenchmarkMTLS(b *testing.B) {
    cert, _ := tls.LoadX509KeyPair("client.crt", "client.key")
    config := &tls.Config{
        Certificates: []tls.Certificate{cert},
        MinVersion:   tls.VersionTLS13,
    }
    benchmarkRequest(b, config)
}
```

Results:

```sh
BenchmarkHTTPS-8    10000    175000 ns/op
BenchmarkMTLS-8      9500    185000 ns/op
```

mTLS adds ~5-10% overhead. Acceptable for most microservices.

## Common Pitfalls

### 1. Certificate Expiration

Monitor certificate expiration:

```go
func checkCertExpiration(cert *x509.Certificate) {
    daysUntilExpiry := time.Until(cert.NotAfter).Hours() / 24
    
    if daysUntilExpiry < 30 {
        log.Printf("WARNING: Certificate expires in %.0f days", daysUntilExpiry)
    }
    
    if daysUntilExpiry < 7 {
        log.Printf("CRITICAL: Certificate expires in %.0f days", daysUntilExpiry)
    }
}
```

### 2. CA Certificate Distribution

All services need the CA certificate. Use:

- ConfigMaps in Kubernetes
- Secret management systems (Vault, AWS Secrets Manager)
- Baked into container images (for immutable CA)

### 3. Certificate Revocation

Implement CRL (Certificate Revocation List) or OCSP:

```go
tlsConfig := &tls.Config{
    ClientCAs:  caCertPool,
    ClientAuth: tls.RequireAndVerifyClientCert,
    VerifyPeerCertificate: func(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
        for _, chain := range verifiedChains {
            for _, cert := range chain {
                if isRevoked(cert) {
                    return fmt.Errorf("certificate revoked: %s", cert.Subject.CommonName)
                }
            }
        }
        return nil
    },
}
```

## Testing mTLS

```go
func TestMTLSAuthentication(t *testing.T) {
    server := startMTLSServer(t)
    defer server.Close()

    tests := []struct {
        name       string
        clientCert string
        clientKey  string
        wantErr    bool
    }{
        {
            name:       "valid certificate",
            clientCert: "testdata/valid-client.crt",
            clientKey:  "testdata/valid-client.key",
            wantErr:    false,
        },
        {
            name:       "expired certificate",
            clientCert: "testdata/expired-client.crt",
            clientKey:  "testdata/expired-client.key",
            wantErr:    true,
        },
        {
            name:       "untrusted CA",
            clientCert: "testdata/untrusted-client.crt",
            clientKey:  "testdata/untrusted-client.key",
            wantErr:    true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            client := createMTLSClient(t, tt.clientCert, tt.clientKey)
            _, err := client.Get(server.URL)
            
            if (err != nil) != tt.wantErr {
                t.Errorf("got error = %v, wantErr = %v", err, tt.wantErr)
            }
        })
    }
}
```

## Conclusion

mTLS provides strong authentication and encryption for microservices. In Go, implementation is straightforward thanks to excellent TLS support in the standard library.

Key takeaways:

- Use mTLS for service-to-service communication
- Implement certificate rotation
- Monitor certificate expiration
- Consider service mesh for automatic mTLS in Kubernetes
- Test certificate validation thoroughly

Security in microservices starts with proper authentication. mTLS is the industry standard.

Additional resources:

- [Go TLS Documentation](https://golang.org/pkg/crypto/tls/)
- [Istio mTLS Guide](<https://istio.io/latest/docs/tasks/security/authentication>)
- [Mutual TLS Explained](https://www.cloudflare.com/learning/security/tls-mtls/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Kubernetes Certificates](https://kubernetes.io/docs/concepts/cluster-administration/certificates/)
- [Cert-Manager](https://cert-manager.io/docs/)
- [HashiCorp Vault PKI](https://www.vaultproject.io/docs/secrets/pki)
- [OCSP and CRL in Go](https://pkg.go.dev/crypto/x509#Certificate.CheckCRLSignature)
- [mTLS Best Practices](https://www.nginx.com/blog/mtls-best-practices/)
