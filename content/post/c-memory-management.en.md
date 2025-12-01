---
title: "C Memory Management for Go Developers: malloc, calloc, realloc and free"
date: 2025-05-01T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["c", "memory", "golang", "cgo", "performance", "systems-programming", "low-level"]
categories: ["C Language"]
---

If you're a Go developer used to automatic memory management, working with `C` might feel archaic. But understanding `malloc`/`free` is critical for `CGO` and low-level optimization.

<!--more-->

## Core Functions

In C, memory is managed manually through four functions:

```c
void* malloc(size_t size);             // Allocates memory
void* calloc(size_t num, size_t size); // Allocates and zeros
void* realloc(void* ptr, size_t size); // Resizes allocation
void free(void* ptr);                  // Frees memory
```

In Go, GC does this automatically:

```go
// Go - memory managed automatically
data := make([]byte, 1024)
// Memory freed automatically when data goes out of scope
```

## malloc: Basic Allocation

```c
#include <stdlib.h>
#include <stdio.h>

int main() {
    // Allocate memory for 10 ints
    int* arr = (int*)malloc(10 * sizeof(int));
    
    if (arr == NULL) {
        fprintf(stderr, "Memory allocation failed\n");
        return 1;
    }
    
    // Use memory
    for (int i = 0; i < 10; i++) {
        arr[i] = i * 2;
    }
    
    // MUST free
    free(arr);
    return 0;
}
```

Go equivalent:

```go
arr := make([]int, 10)
for i := range arr {
    arr[i] = i * 2
}
// No free needed - GC handles it
```

## calloc: Allocation with Zeroing

```c
// malloc doesn't initialize - contains garbage
int* arr1 = (int*)malloc(10 * sizeof(int));
// arr1[0] could be any value!

// calloc zeros memory
int* arr2 = (int*)calloc(10, sizeof(int));
// arr2[0] guaranteed to be 0
```

In Go, make always initializes to zero:

```go
arr := make([]int, 10) // All elements = 0
```

## realloc: Resizing

```c
int* arr = (int*)malloc(5 * sizeof(int));

// Need more space
arr = (int*)realloc(arr, 10 * sizeof(int));
if (arr == NULL) {
    // realloc didn't free old memory on error
    // but we lost the pointer!
}

// Correct way:
int* new_arr = (int*)realloc(arr, 10 * sizeof(int));
if (new_arr == NULL) {
    free(arr); // Free old memory
    return 1;
}
arr = new_arr;
```

In Go, append does this automatically:

```go
arr := make([]int, 5)
arr = append(arr, make([]int, 5)...) // Grows automatically
```

## Using in CGO

This is where it matters for Go developers:

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
    defer C.free(unsafe.Pointer(cInput)) // IMPORTANT!
    
    cResult := C.create_string(cInput)
    defer C.free(unsafe.Pointer(cResult)) // IMPORTANT!
    
    return C.GoString(cResult)
}
```

## Common Mistakes

### 1. Memory Leak

```c
void leak_example() {
    int* data = (int*)malloc(100 * sizeof(int));
    // Forgot free(data)
} // Memory leaked forever
```

In Go, GC prevents this, but in CGO:

```go
func LeakExample() {
    cData := C.malloc(C.size_t(100))
    // Forgot C.free(unsafe.Pointer(cData))
} // Memory leak!
```

### 2. Double Free

```c
int* data = (int*)malloc(10 * sizeof(int));
free(data);
free(data); // ERROR: undefined behavior
```

### 3. Use After Free

```c
int* data = (int*)malloc(10 * sizeof(int));
free(data);
data[0] = 42; // ERROR: using freed memory
```

### 4. Wrong Size

```c
// WRONG
int* arr = (int*)malloc(10); // Allocated 10 bytes, not 10 ints!

// CORRECT
int* arr = (int*)malloc(10 * sizeof(int));
```

## Patterns for CGO

### Wrapper with Automatic Cleanup

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

### Passing Go Slice to C

```go
func ProcessData(data []byte) error {
    // Allocate C memory
    cData := C.malloc(C.size_t(len(data)))
    if cData == nil {
        return fmt.Errorf("allocation failed")
    }
    defer C.free(cData)
    
    // Copy Go data to C memory
    C.memcpy(cData, unsafe.Pointer(&data[0]), C.size_t(len(data)))
    
    // Call C function
    C.process_buffer((*C.char)(cData), C.int(len(data)))
    
    return nil
}
```

## Performance

Comparing malloc vs Go allocator:

```go
// Benchmark C malloc via CGO
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

Results:

```sh
BenchmarkCMalloc-8    5000000    280 ns/op
BenchmarkGoAlloc-8   20000000     85 ns/op
```

Go allocator is faster for small allocations thanks to per-goroutine caches.

## Debugging Memory Leaks

### Valgrind for C Code

```bash
valgrind --leak-check=full ./program
```

### AddressSanitizer

```bash
gcc -fsanitize=address -g program.c -o program
./program
```

### In CGO

```go
// Enable race detector and memory sanitizer
// go build -race -msan
```

## When to Use malloc in Go Projects

1. **C Library Integration**: Inevitable with CGO
2. **Long-lived Buffers**: If GC creates issues
3. **System API Interaction**: Requiring C-style memory
4. **Optimization**: Rare cases for allocation control

## Practical Example: Image Buffer

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

## Conclusion

For Go developers, malloc/free is:

- Necessary when working with CGO
- Source of potential bugs (leaks, use-after-free)
- Sometimes an optimization tool

Key rules:

- Every malloc requires free
- Use defer for guaranteed cleanup
- Consider runtime.SetFinalizer for automation
- Prefer Go allocator where possible

Understanding C memory management makes you a better Go developer, especially when working with system code and CGO.

Additional Resources:

- [C Standard Library - Memory Management](https://en.cppreference.com/w/c/memory)
- [CGO Documentation](https://golang.org/cmd/cgo/)
- [Go Memory Management](https://golang.org/doc/go1.5#memory_management)
- [Valgrind Documentation](https://valgrind.org/docs/manual/mc-manual.html)
