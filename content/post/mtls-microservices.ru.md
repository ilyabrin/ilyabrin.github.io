---
title: "mTLS в микросервисах: взаимная аутентификация"
date: 2025-10-03T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["security", "tls", "microservices", "golang", "authentication", "mtls"]
categories: ["Security"]
---

В обычном HTTPS только сервер доказывает свою подлинность сертификатом. Клиент остаётся анонимным. Но в микросервисах, где сервисы общаются друг с другом, нужно взаимное доверие. Для этого используется mTLS (mutual TLS).

<!--more-->

## Что такое mTLS

mTLS — это TLS с двусторонней аутентификацией:

- Сервер предъявляет свой сертификат клиенту
- Клиент предъявляет свой сертификат серверу
- Оба проверяют сертификаты друг друга

Это решает несколько проблем:

- **Аутентификация**: мы точно знаем, какой сервис к нам обращается
- **Авторизация**: можем выдавать права доступа на основе идентификатора в сертификате
- **Шифрование**: весь трафик зашифрован
- **Нет shared secrets**: не нужно управлять API ключами или токенами

## Как работает mTLS

```sh
1. Client → Server: ClientHello
2. Server → Client: ServerHello + Server Certificate
3. Server → Client: CertificateRequest
4. Client → Server: Client Certificate
5. Оба проверяют сертификаты против доверенного CA
6. Устанавливается зашифрованное соединение
```

Ключевое отличие от обычного TLS: шаги 3-4, где сервер запрашивает, а клиент предоставляет свой сертификат.

## Реализация в Go

### Сервер с mTLS

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

Ключевые моменты:

- `ClientCAs`: CA сертификаты, которым мы доверяем для проверки клиентов
- `ClientAuth: tls.RequireAndVerifyClientCert`: требуем клиентский сертификат
- `r.TLS.PeerCertificates`: доступ к сертификату клиента

### Клиент с mTLS

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

## Генерация сертификатов

Для разработки создайте свой CA:

```bash
# Генерируем CA
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 365 -key ca.key -out ca.crt \
    -subj "/CN=My CA"

# Генерируем серверный сертификат
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
    -subj "/CN=localhost"
openssl x509 -req -days 365 -in server.csr \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out server.crt

# Генерируем клиентский сертификат
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr \
    -subj "/CN=service-a"
openssl x509 -req -days 365 -in client.csr \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out client.crt
```

Для продакшена используйте полноценную PKI инфраструктуру или инструменты типа cert-manager в Kubernetes.

## Авторизация на основе сертификата

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

## Ротация сертификатов

Сертификаты истекают. Реализуем автоматическую ротацию:

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

// Использование
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

## mTLS в Kubernetes

В Kubernetes используйте service mesh типа Istio или Linkerd для автоматического mTLS:

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

Istio автоматически:

- Генерирует сертификаты для каждого пода
- Ротирует сертификаты
- Шифрует трафик между сервисами
- Валидирует сертификаты

## Производительность

mTLS добавляет overhead:

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

Результаты:

```sh
BenchmarkHTTPS-8    10000    175000 ns/op
BenchmarkMTLS-8      9500    185000 ns/op
```

mTLS добавляет ~5-10% overhead. Приемлемо для большинства микросервисов.

## Подводные камни

### 1. Истечение сертификатов

Мониторьте истечение сертификатов:

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

### 2. Распространение CA сертификата

Всем сервисам нужен CA сертификат. Используйте:

- ConfigMaps в Kubernetes
- Системы управления секретами (Vault, AWS Secrets Manager)
- Запекание в образ контейнера (для неизменяемого CA)

### 3. Отзыв сертификатов

Реализуйте CRL (Certificate Revocation List) или OCSP:

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

## Тестирование mTLS

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

## Заключение

mTLS обеспечивает надёжную аутентификацию и шифрование для микросервисов. В Go реализация тривиальна благодаря отличной поддержке TLS в стандартной библиотеке.

Ключевые моменты:

- Используйте mTLS для service-to-service коммуникации
- Реализуйте ротацию сертификатов
- Мониторьте истечение сертификатов
- Рассмотрите service mesh для автоматического mTLS в Kubernetes
- Тщательно тестируйте валидацию сертификатов

Безопасность в микросервисах начинается с правильной аутентификации. mTLS — это индустриальный стандарт.

Дополнительные ресурсы:

- [Go TLS Documentation](https://golang.org/pkg/crypto/tls/)
- [Istio mTLS Guide](<https://istio.io/latest/docs/tasks/security/authentication>)
- [Mutual TLS Explained](https://www.cloudflare.com/learning/security/tls-mtls/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Kubernetes Certificates](https://kubernetes.io/docs/concepts/cluster-administration/certificates/)
- [Cert-Manager](https://cert-manager.io/docs/)
- [HashiCorp Vault PKI](https://www.vaultproject.io/docs/secrets/pki)
- [OCSP and CRL in Go](https://pkg.go.dev/crypto/x509#Certificate.CheckCRLSignature)
- [mTLS Best Practices](https://www.nginx.com/blog/mtls-best-practices/)
