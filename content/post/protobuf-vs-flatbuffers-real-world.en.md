---
title: "Protobuf vs FlatBuffers: what to choose?"
date: 2025-05-10T14:04:14+01:00

author: "Ilya Brin"
categories: ['protobuf', 'flatbuffers', 'performance', 'api']
tags: ['protobuf', 'api', 'performance', 'optimization', 'flatbuffers']
---

Hey performance engineer! ⚡

Is your JSON API crawling under load? MessagePack not saving you anymore?

Time to bring out the heavy artillery - binary serialization protocols.

While others debate JSON beauty, you'll learn when Protobuf is perfect for microservices, and FlatBuffers dominates games and real-time systems.

<!--more-->

## 1. Protobuf vs FlatBuffers: What's the difference?

### Protocol Buffers (Protobuf)

Google's brainchild, used in gRPC, Kubernetes, and thousands of other projects. Compact, fast, with excellent schema support and backward compatibility.

**Key features:**

- Compact serialization (3-10x smaller than JSON)
- Strong typing and schemas
- Excellent backward compatibility
- Code generation for all languages

### FlatBuffers

Created at Google for games, used in Android, Unity, TensorFlow Lite. Zero-copy data access without deserialization.

**Key features:**

- Zero-copy data reading
- Extremely fast field access
- Fewer memory allocations
- Perfect for real-time systems

**Main difference:**
> Protobuf is optimized for size and compatibility, FlatBuffers for data access speed.

## 2. Protobuf: Perfect for microservices

### 🔥 Real case: gRPC API between services

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

### 🔥 Go service implementation

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
    
    // Fill profile
    user.Profile = &pb.UserProfile{
        AvatarUrl: avatarURL.String,
        Bio:       bio.String,
        Metadata:  make(map[string]string),
    }
    
    // Load roles
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
    
    // Save to database
    err := s.saveUser(ctx, user)
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to create user: %v", err)
    }
    
    return user, nil
}
```

### 🔥 Client for service interaction

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
    
    // Add timeout
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

**Why Protobuf is perfect here:**

- **Compactness** - 5x smaller than JSON
- **Type safety** - compile-time error detection
- **Compatibility** - add fields without breaking clients
- **gRPC integration** - works out of the box

## 3. FlatBuffers: Perfect for games and real-time

### Real case: high-load game server

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

### Go game server implementation

```go
//go:generate flatc --go game.fbs

type GameServer struct {
    players    map[string]*PlayerData
    gameState  []byte // Serialized game state
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

// Update player state (called 60 times per second)
func (gs *GameServer) UpdatePlayer(playerID string, position Vector3, health float32) {
    gs.mu.Lock()
    defer gs.mu.Unlock()
    
    player, exists := gs.players[playerID]
    if !exists {
        return
    }
    
    player.Position = position
    player.Health = health
    
    // Serialize update for client broadcast
    gs.serializeGameState()
}

func (gs *GameServer) serializeGameState() {
    gs.builder.Reset()
    
    // Create player array
    var playerOffsets []flatbuffers.UOffsetT
    
    for _, player := range gs.players {
        // Create position
        Game.Vector3Start(gs.builder)
        Game.Vector3AddX(gs.builder, player.Position.X)
        Game.Vector3AddY(gs.builder, player.Position.Y)
        Game.Vector3AddZ(gs.builder, player.Position.Z)
        positionOffset := Game.Vector3End(gs.builder)
        
        // Create strings
        nameOffset := gs.builder.CreateString(player.Name)
        idOffset := gs.builder.CreateString(player.ID)
        
        // Create player
        Game.PlayerStart(gs.builder)
        Game.PlayerAddId(gs.builder, idOffset)
        Game.PlayerAddName(gs.builder, nameOffset)
        Game.PlayerAddPosition(gs.builder, positionOffset)
        Game.PlayerAddHealth(gs.builder, player.Health)
        Game.PlayerAddLevel(gs.builder, player.Level)
        playerOffset := Game.PlayerEnd(gs.builder)
        
        playerOffsets = append(playerOffsets, playerOffset)
    }
    
    // Create players array
    Game.GameStateStartPlayersVector(gs.builder, len(playerOffsets))
    for i := len(playerOffsets) - 1; i >= 0; i-- {
        gs.builder.PrependUOffsetT(playerOffsets[i])
    }
    playersVector := gs.builder.EndVector(len(playerOffsets))
    
    // Create game state
    mapIDOffset := gs.builder.CreateString("level_1")
    
    Game.GameStateStart(gs.builder)
    Game.GameStateAddPlayers(gs.builder, playersVector)
    Game.GameStateAddTimestamp(gs.builder, time.Now().UnixNano())
    Game.GameStateAddMapId(gs.builder, mapIDOffset)
    gameState := Game.GameStateEnd(gs.builder)
    
    gs.builder.Finish(gameState)
    gs.gameState = gs.builder.FinishedBytes()
}

// Zero-copy game state reading
func (gs *GameServer) GetGameState() []byte {
    gs.mu.RLock()
    defer gs.mu.RUnlock()
    return gs.gameState
}

// Handle incoming client updates
func (gs *GameServer) HandlePlayerUpdate(data []byte) {
    // Zero-copy parsing without allocations
    gameState := Game.GetRootAsGameState(data, 0)
    
    playersCount := gameState.PlayersLength()
    for i := 0; i < playersCount; i++ {
        var player Game.Player
        if gameState.Players(&player, i) {
            playerID := string(player.Id())
            
            // Get position without copying
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

**Why FlatBuffers is perfect here:**

- **Speed** - O(1) field access
- **Memory** - minimal consumption
- **Zero-copy** - no allocations when reading
- **Real-time** - suitable for 60+ FPS

## **4. Performance comparison**

### **🔹 Serialization benchmarks:**

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

**Benchmark results:**

```sh
BenchmarkJSON-8         1000000    1200 ns/op    320 B/op    5 allocs/op
BenchmarkProtobuf-8     3000000     450 ns/op     64 B/op    1 allocs/op
BenchmarkFlatBuffers-8  5000000     280 ns/op     32 B/op    0 allocs/op
```

## 5. When to use what?

### Use Protobuf when

✅ **Microservices** - gRPC APIs between services  
✅ **Long-term storage** - files, databases  
✅ **Compatibility** - need schema evolution  
✅ **Size matters** - network traffic, mobile apps  

**Examples:**

- Configuration files
- Structured data logging
- Inter-service communication
- REST API replacement with gRPC

### Use FlatBuffers when

✅ **High frequency** - thousands of operations per second  
✅ **Memory critical** - embedded systems  
✅ **Zero-copy needed** - streaming data processing  
✅ **Real-time systems** - games, trading, IoT  

**Examples:**

- Game servers
- Trading systems
- Vehicle telemetry
- Video/audio processing

### Avoid when

❌ **Protobuf:**

- Need random field access
- Deserialization speed is critical
- Data changes frequently

❌ **FlatBuffers:**

- Need backward compatibility
- Complex nested structures
- Infrequent data updates

## **6. Production tips**

### Protobuf optimization

```go
// Buffer reuse
var protoPool = sync.Pool{
    New: func() interface{} {
        return &pb.User{}
    },
}

func SerializeUser(user *UserData) ([]byte, error) {
    pbUser := protoPool.Get().(*pb.User)
    defer protoPool.Put(pbUser)
    
    // Reset state
    pbUser.Reset()
    
    // Fill with data
    pbUser.Id = user.ID
    pbUser.Name = user.Name
    pbUser.Email = user.Email
    
    return proto.Marshal(pbUser)
}
```

### FlatBuffers optimization

```go
// Builder reuse
var builderPool = sync.Pool{
    New: func() interface{} {
        return flatbuffers.NewBuilder(1024)
    },
}

func SerializeGameState(players []*PlayerData) []byte {
    builder := builderPool.Get().(*flatbuffers.Builder)
    defer builderPool.Put(builder)
    
    builder.Reset()
    
    // Serialization...
    
    return builder.FinishedBytes()
}
```

## Conclusion: Choose the right tool for the job

**Protobuf** - Swiss Army knife for most tasks:
✅ **Ecosystem** - excellent tooling support  
✅ **Versatility** - fits 80% of use cases  
✅ **Compatibility** - painless schema evolution  

**FlatBuffers** - race car for extreme tasks:
✅ **Speed** - maximum performance  
✅ **Memory** - minimal allocations  
✅ **Real-time** - for time-critical systems  

**Main rule:**
> Start with Protobuf for regular tasks. Switch to FlatBuffers only when performance is critical.

**P.S. What serialization protocols do you use in production? Share your experience in the comments!** ⚡

```go
// Additional resources:
// - Protocol Buffers: https://developers.google.com/protocol-buffers
// - FlatBuffers: https://google.github.io/flatbuffers/
// - gRPC: https://grpc.io/
```
