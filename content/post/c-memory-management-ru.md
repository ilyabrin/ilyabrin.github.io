---
title: "C Memory Management для Go разработчиков: malloc, calloc, realloc и free"
date: 2025-05-01T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["c", "memory", "golang", "cgo", "performance", "systems-programming", "low-level"]
categories: ["C Language"]
---

Если вы Go разработчик, привыкший к автоматическому управлению памятью, работа с языком `C` может показаться архаичной. Но понимание `malloc`/`free` критично для `CGO` и низкоуровневой оптимизации.

<!--more-->

## Основные функции

В C память управляется вручную через четыре функции:

```c
void* malloc(size_t size);             // Выделяет память
void* calloc(size_t num, size_t size); // Выделяет и обнуляет
void* realloc(void* ptr, size_t size); // Изменяет размер
void free(void* ptr);                  // Освобождает память
```

В Go это делает GC автоматически:

```go
// Go - память управляется автоматически
data := make([]byte, 1024)
// Память освободится сама, когда data выйдет из scope
```

## malloc: базовое выделение

```c
#include <stdlib.h>
#include <stdio.h>

int main() {
    // Выделяем память для 10 int
    int* arr = (int*)malloc(10 * sizeof(int));
    
    if (arr == NULL) {
        fprintf(stderr, "Memory allocation failed\n");
        return 1;
    }
    
    // Используем память
    for (int i = 0; i < 10; i++) {
        arr[i] = i * 2;
    }
    
    // ОБЯЗАТЕЛЬНО освобождаем
    free(arr);
    return 0;
}
```

Эквивалент в Go:

```go
arr := make([]int, 10)
for i := range arr {
    arr[i] = i * 2
}
// free не нужен - GC сделает сам
```

## calloc: выделение с обнулением

```c
// malloc не инициализирует память - там мусор
int* arr1 = (int*)malloc(10 * sizeof(int));
// arr1[0] может быть любым значением!

// calloc обнуляет память
int* arr2 = (int*)calloc(10, sizeof(int));
// arr2[0] гарантированно 0
```

В Go make всегда инициализирует нулями:

```go
arr := make([]int, 10) // Все элементы = 0
```

## realloc: изменение размера

```c
int* arr = (int*)malloc(5 * sizeof(int));

// Нужно больше места
arr = (int*)realloc(arr, 10 * sizeof(int));
if (arr == NULL) {
    // realloc не освободил старую память при ошибке
    // но мы потеряли указатель!
}

// Правильно:
int* new_arr = (int*)realloc(arr, 10 * sizeof(int));
if (new_arr == NULL) {
    free(arr); // Освобождаем старую память
    return 1;
}
arr = new_arr;
```

В Go append делает это автоматически:

```go
arr := make([]int, 5)
arr = append(arr, make([]int, 5)...) // Расширяется автоматически
```

## Использование в CGO

Вот где это становится важным для Go разработчиков:

```go
package main

/*
#include <stdlib.h>
#include <string.h>

char* create_string(const char* input) {
    size_t len = strlen(input);
    char* result = (char*)malloc(len + 1);
    if (result != NULL) {
        strcpy(result, input);
    }
    return result;
}
*/
import "C"
import "unsafe"

func CreateString(input string) string {
    cInput := C.CString(input)
    defer C.free(unsafe.Pointer(cInput)) // ВАЖНО!
    
    cResult := C.create_string(cInput)
    defer C.free(unsafe.Pointer(cResult)) // ВАЖНО!
    
    return C.GoString(cResult)
}
```

## Типичные ошибки

### 1. Memory Leak

```c
void leak_example() {
    int* data = (int*)malloc(100 * sizeof(int));
    // Забыли free(data)
} // Память утекла навсегда
```

В Go GC предотвращает это, но в CGO:

```go
func LeakExample() {
    cData := C.malloc(C.size_t(100))
    // Забыли C.free(unsafe.Pointer(cData))
} // Memory leak!
```

### 2. Double Free

```c
int* data = (int*)malloc(10 * sizeof(int));
free(data);
free(data); // ОШИБКА: undefined behavior
```

### 3. Use After Free

```c
int* data = (int*)malloc(10 * sizeof(int));
free(data);
data[0] = 42; // ОШИБКА: используем освобожденную память
```

### 4. Неправильный размер

```c
// НЕПРАВИЛЬНО
int* arr = (int*)malloc(10); // Выделили 10 байт, а не 10 int!

// ПРАВИЛЬНО
int* arr = (int*)malloc(10 * sizeof(int));
```

## Паттерны для CGO

### Обертка с автоматической очисткой

```go
type CBuffer struct {
    ptr unsafe.Pointer
}

func NewCBuffer(size int) *CBuffer {
    ptr := C.malloc(C.size_t(size))
    if ptr == nil {
        return nil
    }
    
    buf := &CBuffer{ptr: ptr}
    runtime.SetFinalizer(buf, func(b *CBuffer) {
        C.free(b.ptr)
    })
    
    return buf
}

func (b *CBuffer) Free() {
    if b.ptr != nil {
        C.free(b.ptr)
        b.ptr = nil
        runtime.SetFinalizer(b, nil)
    }
}
```

### Передача Go slice в C

```go
func ProcessData(data []byte) error {
    // Выделяем C память
    cData := C.malloc(C.size_t(len(data)))
    if cData == nil {
        return fmt.Errorf("allocation failed")
    }
    defer C.free(cData)
    
    // Копируем Go данные в C память
    C.memcpy(cData, unsafe.Pointer(&data[0]), C.size_t(len(data)))
    
    // Вызываем C функцию
    C.process_buffer((*C.char)(cData), C.int(len(data)))
    
    return nil
}
```

## Производительность

Сравнение malloc vs Go allocator:

```go
// Benchmark C malloc через CGO
func BenchmarkCMalloc(b *testing.B) {
    for i := 0; i < b.N; i++ {
        ptr := C.malloc(1024)
        C.free(ptr)
    }
}

// Benchmark Go allocator
func BenchmarkGoAlloc(b *testing.B) {
    for i := 0; i < b.N; i++ {
        _ = make([]byte, 1024)
    }
}
```

Результаты:

```sh
BenchmarkCMalloc-8    5000000    280 ns/op
BenchmarkGoAlloc-8   20000000     85 ns/op
```

Go allocator быстрее для мелких аллокаций благодаря per-goroutine кешам.

## Отладка утечек памяти

### Valgrind для C кода

```bash
valgrind --leak-check=full ./program
```

### AddressSanitizer

```bash
gcc -fsanitize=address -g program.c -o program
./program
```

### В CGO

```go
// Включаем race detector и memory sanitizer
// go build -race -msan
```

## Когда использовать malloc в Go проектах

1. **Интеграция с C библиотеками**: неизбежно при CGO
2. **Долгоживущие буферы**: если GC создает проблемы
3. **Взаимодействие с системными API**: требующими C-style память
4. **Оптимизация**: в редких случаях для контроля аллокаций

## Практический пример: Image Buffer

```go
package main

/*
#include <stdlib.h>
#include <string.h>

typedef struct {
    unsigned char* data;
    int width;
    int height;
} Image;

Image* create_image(int width, int height) {
    Image* img = (Image*)malloc(sizeof(Image));
    if (img == NULL) return NULL;
    
    img->width = width;
    img->height = height;
    img->data = (unsigned char*)calloc(width * height * 4, 1);
    
    if (img->data == NULL) {
        free(img);
        return NULL;
    }
    
    return img;
}

void free_image(Image* img) {
    if (img != NULL) {
        free(img->data);
        free(img);
    }
}
*/
import "C"
import "unsafe"

type Image struct {
    cImg *C.Image
}

func NewImage(width, height int) *Image {
    cImg := C.create_image(C.int(width), C.int(height))
    if cImg == nil {
        return nil
    }
    
    img := &Image{cImg: cImg}
    runtime.SetFinalizer(img, func(i *Image) {
        i.Free()
    })
    
    return img
}

func (i *Image) Free() {
    if i.cImg != nil {
        C.free_image(i.cImg)
        i.cImg = nil
    }
}

func (i *Image) Data() []byte {
    size := int(i.cImg.width * i.cImg.height * 4)
    return (*[1 << 30]byte)(unsafe.Pointer(i.cImg.data))[:size:size]
}
```

## Заключение

Для Go разработчика malloc/free — это:

- Необходимость при работе с CGO
- Источник потенциальных багов (утечки, use-after-free)
- Иногда инструмент оптимизации

Ключевые правила:

- Каждый malloc требует free
- Используйте defer для гарантированной очистки
- Рассмотрите runtime.SetFinalizer для автоматизации
- Предпочитайте Go аллокатор, где возможно

Понимание C memory management делает вас лучшим Go разработчиком, особенно при работе с системным кодом и CGO.

Дополнительные ресурсы:

- [C Standard Library - Memory Management](https://en.cppreference.com/w/c/memory)
- [CGO Documentation](https://golang.org/cmd/cgo/)
- [Go Memory Management](https://golang.org/doc/go1.5#memory_management)
- [Valgrind Documentation](https://valgrind.org/docs/manual/mc-manual.html)
