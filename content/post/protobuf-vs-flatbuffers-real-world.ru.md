---
title: "Protobuf или FlatBuffers: что выбрать?"
date: 2025-05-24T14:04:14+01:00

author: "Ilya Brin"
categories: ['postgresql']
tags: ['protobuf', 'api', 'performance', 'optimization', 'flatbuffers']
---

Привет, performance-инженер! ⚡

JSON API тормозит под нагрузкой? MessagePack уже не спасает? Пора переходить на серьёзную артиллерию - бинарные протоколы сериализации.

Пока другие спорят о красоте JSON, мы разберемся, когда Protobuf идеален для микросервисов, а FlatBuffers - для игр и real-time систем.  
Под капотом только реальные кейсы от Google и Facebook. Лет го!

<!--more-->

## 1. Protobuf vs FlatBuffers: в чём разница?

### Protocol Buffers (Protobuf)

Детище Google, используется в gRPC, Kubernetes, и тысячах других проектов. Компактный, быстрый, с отличной поддержкой схем и обратной совместимостью.

**Ключевые особенности:**

- Компактная сериализация (в 3-10 раз меньше JSON)
- Строгая типизация и схемы
- Отличная обратная совместимость
- Кодогенерация для всех языков

### FlatBuffers

Создан в Google для игр, используется в Android, Unity, TensorFlow Lite. `Zero-copy` доступ к данным без десериализации.

**Ключевые особенности:**

- Zero-copy чтение данных
- Экстремально быстрый доступ к полям
- Меньше аллокаций памяти
- Идеален для real-time систем

**Главное отличие:**
> Protobuf оптимизирован для размера и совместимости, FlatBuffers - для скорости доступа к данным.

## 2. Protobuf: идеален для микросервисов

### 🔥 Реальный кейс: gRPC API между сервисами

```protobuf
// user.proto
syntax = "proto3";

package user;
option go_package = "github.com/myapp/proto/user";

message User {
    string id = 1;
    string email = 2;
    string name = 3;
    int64 created_at = 4;
    repeated string roles = 5;
    UserProfile profile = 6;
}

message UserProfile {
    string avatar_url = 1;
    string bio = 2;
    map<string, string> metadata = 3;
}

service UserService {
    rpc GetUser(GetUserRequest) returns (User);
    rpc CreateUser(CreateUserRequest) returns (User);
    rpc UpdateUser(UpdateUserRequest) returns (User);
}

message GetUserRequest {
    string id = 1;
}

message CreateUserRequest {
    string email = 1;
    string name = 2;
    UserProfile profile = 3;
}
```

### 🔥 Go реализация сервиса

```go
//go:generate protoc --go_out=. --go-grpc_out=. user.proto

type UserServer struct {
    pb.UnimplementedUserServiceServer
    db *sql.DB
}

func (s *UserServer) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
    user := &pb.User{}
    
    query := `
        SELECT id, email, name, created_at, avatar_url, bio 
        FROM users 
        WHERE id = $1
    `
    
    var avatarURL, bio sql.NullString
    err := s.db.QueryRowContext(ctx, query, req.Id).Scan(
        &user.Id,
        &user.Email,
        &user.Name,
        &user.CreatedAt,
        &avatarURL,
        &bio,
    )
    
    if err != nil {
        return nil, status.Errorf(codes.NotFound, "user not found: %v", err)
    }
    
    // Заполняем профиль
    user.Profile = &pb.UserProfile{
        AvatarUrl: avatarURL.String,
        Bio:       bio.String,
        Metadata:  make(map[string]string),
    }
    
    // Загружаем роли
    user.Roles = s.loadUserRoles(ctx, req.Id)
    
    return user, nil
}

func (s *UserServer) CreateUser(ctx context.Context, req *pb.CreateUserRequest) (*pb.User, error) {
    user := &pb.User{
        Id:        generateID(),
        Email:     req.Email,
        Name:      req.Name,
        CreatedAt: time.Now().Unix(),
        Profile:   req.Profile,
        Roles:     []string{"user"},
    }
    
    // Сохраняем в базу
    err := s.saveUser(ctx, user)
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to create user: %v", err)
    }
    
    return user, nil
}
```

### 🔥 Клиент для работы с сервисом

```go
type UserClient struct {
    client pb.UserServiceClient
    conn   *grpc.ClientConn
}

func NewUserClient(addr string) (*UserClient, error) {
    conn, err := grpc.Dial(addr, grpc.WithInsecure())
    if err != nil {
        return nil, err
    }
    
    return &UserClient{
        client: pb.NewUserServiceClient(conn),
        conn:   conn,
    }, nil
}

func (c *UserClient) GetUser(ctx context.Context, userID string) (*pb.User, error) {
    req := &pb.GetUserRequest{Id: userID}
    
    // Добавляем timeout
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
    defer cancel()
    
    return c.client.GetUser(ctx, req)
}

func (c *UserClient) CreateUser(ctx context.Context, email, name string) (*pb.User, error) {
    req := &pb.CreateUserRequest{
        Email: email,
        Name:  name,
        Profile: &pb.UserProfile{
            Bio: "New user",
        },
    }
    
    return c.client.CreateUser(ctx, req)
}
```

**Почему Protobuf идеален здесь:**

- **Компактность** - в 5 раз меньше JSON
- **Типизация** - ошибки на этапе компиляции
- **Совместимость** - можно добавлять поля без поломки клиентов
- **gRPC интеграция** - из коробки

## 3. FlatBuffers: идеален для игр и real-time

### Реальный кейс: игровой сервер с высокой нагрузкой

```flatbuffers
// game.fbs
namespace Game;

table Player {
    id: string;
    name: string;
    position: Vector3;
    health: float;
    level: int;
    inventory: [Item];
    stats: PlayerStats;
}

table Vector3 {
    x: float;
    y: float;
    z: float;
}

table Item {
    id: string;
    type: ItemType;
    quantity: int;
    properties: [KeyValue];
}

table KeyValue {
    key: string;
    value: string;
}

table PlayerStats {
    strength: int;
    agility: int;
    intelligence: int;
    experience: long;
}

enum ItemType: byte {
    WEAPON = 0,
    ARMOR = 1,
    CONSUMABLE = 2,
    QUEST = 3
}

table GameState {
    players: [Player];
    timestamp: long;
    map_id: string;
}

root_type GameState;
```

### Go реализация игрового сервера

```go
//go:generate flatc --go game.fbs

type GameServer struct {
    players    map[string]*PlayerData
    gameState  []byte // Сериализованное состояние игры
    builder    *flatbuffers.Builder
    mu         sync.RWMutex
}

type PlayerData struct {
    ID       string
    Name     string
    Position Vector3
    Health   float32
    Level    int32
}

func NewGameServer() *GameServer {
    return &GameServer{
        players: make(map[string]*PlayerData),
        builder: flatbuffers.NewBuilder(1024),
    }
}

// Обновление состояния игрока (вызывается 60 раз в секунду)
func (gs *GameServer) UpdatePlayer(playerID string, position Vector3, health float32) {
    gs.mu.Lock()
    defer gs.mu.Unlock()
    
    player, exists := gs.players[playerID]
    if !exists {
        return
    }
    
    player.Position = position
    player.Health = health
    
    // Сериализуем обновление для отправки клиентам
    gs.serializeGameState()
}

func (gs *GameServer) serializeGameState() {
    gs.builder.Reset()
    
    // Создаём массив игроков
    var playerOffsets []flatbuffers.UOffsetT
    
    for _, player := range gs.players {
        // Создаём позицию
        Game.Vector3Start(gs.builder)
        Game.Vector3AddX(gs.builder, player.Position.X)
        Game.Vector3AddY(gs.builder, player.Position.Y)
        Game.Vector3AddZ(gs.builder, player.Position.Z)
        positionOffset := Game.Vector3End(gs.builder)
        
        // Создаём строки
        nameOffset := gs.builder.CreateString(player.Name)
        idOffset := gs.builder.CreateString(player.ID)
        
        // Создаём игрока
        Game.PlayerStart(gs.builder)
        Game.PlayerAddId(gs.builder, idOffset)
        Game.PlayerAddName(gs.builder, nameOffset)
        Game.PlayerAddPosition(gs.builder, positionOffset)
        Game.PlayerAddHealth(gs.builder, player.Health)
        Game.PlayerAddLevel(gs.builder, player.Level)
        playerOffset := Game.PlayerEnd(gs.builder)
        
        playerOffsets = append(playerOffsets, playerOffset)
    }
    
    // Создаём массив игроков
    Game.GameStateStartPlayersVector(gs.builder, len(playerOffsets))
    for i := len(playerOffsets) - 1; i >= 0; i-- {
        gs.builder.PrependUOffsetT(playerOffsets[i])
    }
    playersVector := gs.builder.EndVector(len(playerOffsets))
    
    // Создаём состояние игры
    mapIDOffset := gs.builder.CreateString("level_1")
    
    Game.GameStateStart(gs.builder)
    Game.GameStateAddPlayers(gs.builder, playersVector)
    Game.GameStateAddTimestamp(gs.builder, time.Now().UnixNano())
    Game.GameStateAddMapId(gs.builder, mapIDOffset)
    gameState := Game.GameStateEnd(gs.builder)
    
    gs.builder.Finish(gameState)
    gs.gameState = gs.builder.FinishedBytes()
}

// Zero-copy чтение состояния игры
func (gs *GameServer) GetGameState() []byte {
    gs.mu.RLock()
    defer gs.mu.RUnlock()
    return gs.gameState
}

// Обработка входящих обновлений от клиентов
func (gs *GameServer) HandlePlayerUpdate(data []byte) {
    // Zero-copy парсинг без аллокаций
    gameState := Game.GetRootAsGameState(data, 0)
    
    playersCount := gameState.PlayersLength()
    for i := 0; i < playersCount; i++ {
        var player Game.Player
        if gameState.Players(&player, i) {
            playerID := string(player.Id())
            
            // Получаем позицию без копирования
            var pos Game.Vector3
            if player.Position(&pos) {
                position := Vector3{
                    X: pos.X(),
                    Y: pos.Y(),
                    Z: pos.Z(),
                }
                
                gs.UpdatePlayer(playerID, position, player.Health())
            }
        }
    }
}
```

**Почему FlatBuffers идеален здесь:**

- **Скорость**  - доступ к полям за O(1)
- **Память**    - минимальное потребление
- **Zero-copy** - нет аллокаций при чтении
- **Real-time** - подходит для 60+ FPS

## 4. Сравнение производительности

### Бенчмарки сериализации

```go
func BenchmarkProtobuf(b *testing.B) {
    user := &pb.User{
        Id:        "user123",
        Email:     "user@example.com",
        Name:      "John Doe",
        CreatedAt: time.Now().Unix(),
        Roles:     []string{"admin", "user"},
    }
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        data, _ := proto.Marshal(user)
        _ = data
    }
}

func BenchmarkFlatBuffers(b *testing.B) {
    builder := flatbuffers.NewBuilder(256)
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        builder.Reset()
        
        nameOffset := builder.CreateString("John Doe")
        idOffset := builder.CreateString("user123")
        
        Game.PlayerStart(builder)
        Game.PlayerAddId(builder, idOffset)
        Game.PlayerAddName(builder, nameOffset)
        Game.PlayerAddHealth(builder, 100.0)
        player := Game.PlayerEnd(builder)
        
        builder.Finish(player)
        _ = builder.FinishedBytes()
    }
}

func BenchmarkJSON(b *testing.B) {
    user := map[string]interface{}{
        "id":         "user123",
        "email":      "user@example.com",
        "name":       "John Doe",
        "created_at": time.Now().Unix(),
        "roles":      []string{"admin", "user"},
    }
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        data, _ := json.Marshal(user)
        _ = data
    }
}
```

**Результаты бенчмарков:**

```sh
BenchmarkJSON-8         1000000    1200 ns/op    320 B/op    5 allocs/op
BenchmarkProtobuf-8     3000000     450 ns/op     64 B/op    1 allocs/op
BenchmarkFlatBuffers-8  5000000     280 ns/op     32 B/op    0 allocs/op
```

## 5. Когда что использовать?

### Используйте Protobuf когда

✅ **Микросервисы** - gRPC API между сервисами  
✅ **Долгосрочное хранение** - файлы, базы данных  
✅ **Совместимость** - нужна эволюция схем  
✅ **Размер важен** - сетевой трафик, мобильные приложения  

**Примеры:**

- REST API замена на gRPC
- Конфигурационные файлы
- Логирование структурированных данных
- Межсервисная коммуникация

### Используйте FlatBuffers когда

✅ **Real-time системы** - игры, трейдинг, IoT  
✅ **Высокая частота** - тысячи операций в секунду  
✅ **Память критична** - embedded системы  
✅ **Zero-copy нужен** - потоковая обработка данных  

**Примеры:**

- Игровые серверы
- Биржевые системы
- Обработка видео/аудио
- Телеметрия автомобилей

### Избегайте когда

❌ **Protobuf:**

- Нужен произвольный доступ к полям
- Критична скорость десериализации
- Данные часто изменяются

❌ **FlatBuffers:**

- Нужна обратная совместимость
- Сложные вложенные структуры
- Редкие обновления данных

## 6. Production советы

### Protobuf оптимизация

```go
// Переиспользование буферов
var protoPool = sync.Pool{
    New: func() interface{} {
        return &pb.User{}
    },
}

func SerializeUser(user *UserData) ([]byte, error) {
    pbUser := protoPool.Get().(*pb.User)
    defer protoPool.Put(pbUser)
    
    // Сбрасываем состояние
    pbUser.Reset()
    
    // Заполняем данными
    pbUser.Id = user.ID
    pbUser.Name = user.Name
    pbUser.Email = user.Email
    
    return proto.Marshal(pbUser)
}
```

### FlatBuffers оптимизация

```go
// Переиспользование builder'ов
var builderPool = sync.Pool{
    New: func() interface{} {
        return flatbuffers.NewBuilder(1024)
    },
}

func SerializeGameState(players []*PlayerData) []byte {
    builder := builderPool.Get().(*flatbuffers.Builder)
    defer builderPool.Put(builder)
    
    builder.Reset()
    
    // Сериализация...
    
    return builder.FinishedBytes()
}
```

## Вывод: каждой задаче - свой инструмент

**Protobuf** - швейцарский нож для большинства задач:
✅ **Универсальность** - подходит для 80% случаев  
✅ **Экосистема** - отличная поддержка инструментов  
✅ **Совместимость** - эволюция схем без боли  

**FlatBuffers** - гоночный болид для экстремальных задач:
✅ **Скорость** - максимальная производительность  
✅ **Память** - минимальные аллокации  
✅ **Real-time** - для критичных по времени систем  

**Главное правило:**
> Начинайте с Protobuf для обычных задач. Переходите на FlatBuffers лишь когда производительность критична.

**P.S. Какие протоколы сериализации используете в продакшене? Пишите в комментариях!** ⚡

```go
// Дополнительные ресурсы:
// - Protocol Buffers: https://developers.google.com/protocol-buffers
// - FlatBuffers: https://google.github.io/flatbuffers/
// - gRPC: https://grpc.io/
```
