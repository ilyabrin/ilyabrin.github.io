---
title: "HTTP-сервер: Go vs Rust"
date: 2026-05-04T00:01:00+03:00
draft: false
author: "Ilya Brin"
tags: ["go", "rust", "http", "backend"]
categories: ["Backend"]
---

Сравним, как реализуется простой HTTP-сервер на Go и Rust — два языка, которые часто ставят рядом, когда речь заходит о производительности и надёжности.

<!--more-->

## Простейший HTTP-сервер

Задача: сервер слушает порт 8080 и отвечает `Hello, World!` на любой GET-запрос к `/`.

{{< code-tabs >}}
{{< code-tab lang="go" label="Go" >}}
```go
package main

import (
    "fmt"
    "net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintln(w, "Hello, World!")
}

func main() {
    http.HandleFunc("/", handler)
    http.ListenAndServe(":8080", nil)
}
```
{{< /code-tab >}}
{{< code-tab lang="rust" label="Rust" >}}
```rust
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};

fn handle(mut stream: TcpStream) {
    let reader = BufReader::new(&stream);
    // consume request headers
    for line in reader.lines() {
        if line.unwrap_or_default().is_empty() { break; }
    }
    let response = "HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, World!";
    stream.write_all(response.as_bytes()).unwrap();
}

fn main() {
    let listener = TcpListener::bind("0.0.0.0:8080").unwrap();
    for stream in listener.incoming().flatten() {
        handle(stream);
    }
}
```
{{< /code-tab >}}
{{< /code-tabs >}}

На Go stdlib уже включает полноценный HTTP-сервер с маршрутизацией. В Rust стандартная библиотека даёт только TCP — для production используют [Axum](https://github.com/tokio-rs/axum) или [Actix Web](https://actix.rs/).

## Маршрутизация и JSON

Добавим роут `/ping`, возвращающий JSON.

{{< code-tabs >}}
{{< code-tab lang="go" label="Go" >}}
```go
package main

import (
    "encoding/json"
    "net/http"
)

type Pong struct {
    Status string `json:"status"`
}

func pingHandler(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(Pong{Status: "ok"})
}

func main() {
    http.HandleFunc("/ping", pingHandler)
    http.ListenAndServe(":8080", nil)
}
```
{{< /code-tab >}}
{{< code-tab lang="rust" label="Rust (Axum)" >}}
```rust
use axum::{routing::get, Router};
use serde::Serialize;
use axum::Json;

#[derive(Serialize)]
struct Pong {
    status: &'static str,
}

async fn ping() -> Json<Pong> {
    Json(Pong { status: "ok" })
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/ping", get(ping));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```
{{< /code-tab >}}
{{< /code-tabs >}}

## Что выбрать?

| | Go | Rust |
|---|---|---|
| Порог входа | Низкий | Высокий |
| Стандартная HTTP-либа | Есть | Только TCP |
| Async из коробки | Goroutines | Tokio/async-std |
| Скорость компиляции | Быстрая | Медленная |
| Runtime overhead | GC | Нет |

Go — прагматичный выбор для большинства backend-сервисов. Rust даёт максимальный контроль там, где каждая миллисекунда и каждый байт на счету.
