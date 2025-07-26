---
title: "PostgreSQL Random Data Generation"
date: 2025-07-26T14:04:14+01:00

author: "Ilya Brin"
categories: ['postgresql', 'database', 'data-generation']
tags: ['sql', 'pg', 'postgresql', 'databases', 'random-data', 'test-data', 'promocodes', 'data-masking']
---

Hey developer! 🎲

Need to generate promo codes for a campaign? Create a million test users? Or just mask production data for development? PostgreSQL can do much more than just `SELECT random()`.

Let's explore how to turn PostgreSQL into a random data generator for real-world tasks.

<!--more-->

## Why generate random data in the database?

### Real-world use cases

- **Unique IDs** - when UUID is too long and auto-increment is predictable
- **Test data** - millions of records for load testing
- **Data masking** - replacing real names/phones with fake ones
- **Tokens and API keys** - secure identifiers for integrations  
- **Promo codes and coupons** - unique codes for marketing campaigns

**Why PostgreSQL specifically?**

- Atomicity - everything in one transaction
- Performance - generation directly in DB is faster than in code
- Rich function set - from simple `random()` to complex algorithms

## 2. Basic generation functions

### 🔥 Essential tools

```sql
-- Random number from 0 to 1
SELECT random();

-- Random integer in range
SELECT floor(random() * 100)::int; -- 0-99

-- Random string of fixed length
SELECT substr(md5(random()::text), 1, 8);

-- UUID (if you need standard)
SELECT gen_random_uuid();
```

### 🔥 Promo code generation

```sql
-- Simple promo code with letters and numbers
CREATE OR REPLACE FUNCTION generate_promo_code(length int DEFAULT 8)
RETURNS text AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result text := '';
    i int;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Usage
SELECT generate_promo_code(10); -- RESULT: K7M9X2P4Q1
```

### **🔥 Readable promo codes (no confusion between 0/O, 1/I):**

```sql
CREATE OR REPLACE FUNCTION generate_readable_code(length int DEFAULT 6)
RETURNS text AS $$
DECLARE
    -- Remove similar characters
    chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    result text := '';
    i int;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Example: SUMMER2024
SELECT 'SUMMER' || generate_readable_code(4);
```

## 3. Advanced generation for real tasks

### Test user generation

```sql
-- Bulk user generation
WITH random_users AS (
    SELECT 
        generate_series(1, 10000) as id,
        (ARRAY['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma'])[floor(random() * 6 + 1)] as first_name,
        (ARRAY['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'])[floor(random() * 5 + 1)] as last_name,
        'user' || generate_series(1, 10000) || '@test.com' as email,
        floor(random() * 80 + 18) as age,
        (random() * 100000)::numeric(10,2) as balance
)
INSERT INTO users (first_name, last_name, email, age, balance)
SELECT first_name, last_name, email, age, balance FROM random_users;
```

### Realistic phone generation

```sql
CREATE OR REPLACE FUNCTION generate_phone()
RETURNS text AS $$
BEGIN
    RETURN '+1' || 
           (200 + floor(random() * 799))::text || 
           lpad(floor(random() * 10000000)::text, 7, '0');
END;
$$ LANGUAGE plpgsql;

-- Result: +12051234567
SELECT generate_phone();
```

### Timestamp generation

```sql
-- Random date in last 30 days
SELECT NOW() - (random() * interval '30 days');

-- Random time during business hours
SELECT date_trunc('day', NOW()) + 
       (9 + random() * 9) * interval '1 hour' + 
       (random() * 60) * interval '1 minute';
```

## 4. Secure token and key generation

### 🔥 Cryptographically strong tokens

```sql
-- Requires pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secure API key
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS text AS $$
BEGIN
    RETURN 'ak_' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Result: ak_f4e5d6c7b8a9...
SELECT generate_api_key();
```

### 🔥 Tokens with checksum

```sql
CREATE OR REPLACE FUNCTION generate_secure_token()
RETURNS text AS $$
DECLARE
    token text;
    checksum text;
BEGIN
    token := encode(gen_random_bytes(16), 'hex');
    checksum := substr(md5(token || 'secret_salt'), 1, 4);
    RETURN token || checksum;
END;
$$ LANGUAGE plpgsql;
```

## 5. Optimization and performance

### Bulk generation with batching

```sql
-- Generate 1 million promo codes at once
INSERT INTO promo_codes (code, created_at)
SELECT 
    generate_promo_code(8),
    NOW() + (random() * interval '30 days')
FROM generate_series(1, 1000000);
```

### Avoiding duplicates

```sql
-- Generation with uniqueness check
CREATE OR REPLACE FUNCTION generate_unique_code(table_name text, column_name text)
RETURNS text AS $$
DECLARE
    new_code text;
    exists_check boolean;
BEGIN
    LOOP
        new_code := generate_promo_code(8);
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE %I = $1)', 
                      table_name, column_name) 
        USING new_code INTO exists_check;
        
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;
```

## 6. Practical business examples

### Discount coupon system

```sql
-- Create coupons table
CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(12) UNIQUE NOT NULL,
    discount_percent INT CHECK (discount_percent BETWEEN 1 AND 100),
    valid_until TIMESTAMP,
    usage_limit INT DEFAULT 1,
    used_count INT DEFAULT 0
);

-- Generate coupons for campaign
INSERT INTO coupons (code, discount_percent, valid_until, usage_limit)
SELECT 
    'SALE' || generate_readable_code(6),
    (ARRAY[10, 15, 20, 25])[floor(random() * 4 + 1)],
    NOW() + interval '7 days',
    floor(random() * 100 + 1)
FROM generate_series(1, 1000);
```

### Test order generation

```sql
-- Realistic orders with random data
INSERT INTO orders (user_id, total_amount, status, created_at)
SELECT 
    floor(random() * 10000 + 1),
    (random() * 5000 + 100)::numeric(10,2),
    (ARRAY['pending', 'processing', 'shipped', 'delivered'])[floor(random() * 4 + 1)],
    NOW() - (random() * interval '90 days')
FROM generate_series(1, 50000);
```

## Conclusion: PostgreSQL is more than just storage

PostgreSQL can be a powerful data generator for:
✅ **Testing** - millions of realistic records  
✅ **Security** - cryptographically strong tokens  
✅ **Development** - production data masking  
✅ **Marketing campaigns** - unique promo codes and coupons  

**Main rule:**
> Generate data where you need it - directly in the database. It's faster and more reliable.

**P.S. What data do you generate in your projects? Share your experience in the comments!** 🚀

```sql
-- Additional resources:
-- - PostgreSQL Random Functions: https://www.postgresql.org/docs/current/functions-math.html
-- - pgcrypto Extension: https://www.postgresql.org/docs/current/pgcrypto.html
-- - Generating Test Data: https://wiki.postgresql.org/wiki/Generating_test_data
-- - PL/pgSQL Documentation: https://www.postgresql.org/docs/current/plpgsql.html
```
