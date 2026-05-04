---
title: "HTTP Server: Go vs Rust"
date: 2026-05-04T00:01:00+03:00
draft: false
author: "Ilya Brin"
tags: ["go", "rust", "http", "backend"]
categories: ["Backend"]
---

Let's compare how a basic HTTP server looks in Go and Rust — two languages often mentioned together when performance and reliability matter.

<!--more-->

## A Minimal HTTP Server

Goal: listen on port 8080, respond with `Hello, World!` for any GET request to `/`.

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

Go's stdlib ships a full HTTP server with routing. In Rust, the standard library only gives you TCP — in production you'd use [Axum](https://github.com/tokio-rs/axum) or [Actix Web](https://actix.rs/).

## Routing and JSON

Add a `/ping` route that returns JSON.

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

## Which to Pick?

| | Go | Rust |
|---|---|---|
| Learning curve | Low | High |
| Built-in HTTP lib | Yes | TCP only |
| Async model | Goroutines | Tokio/async-std |
| Compile speed | Fast | Slow |
| Runtime overhead | GC | None |

Go is the pragmatic choice for most backend services. Rust gives you maximum control when every millisecond and every byte counts.
