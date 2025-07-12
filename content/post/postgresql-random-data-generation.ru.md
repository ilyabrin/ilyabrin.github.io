---
title: "PostgreSQL и генерация случайных данных"
date: 2025-07-12T14:04:14+01:00

author: "Ilya Brin"
categories: ['postgresql', 'database', 'data-generation']
tags: ['sql', 'pg', 'postgresql', 'databases', 'random-data', 'test-data', 'promocodes', 'data-masking']
---

Привет, разработчик! 🎲

Тебе нужно сгенерировать промокоды для акции? Создать миллион тестовых пользователей? Или просто замаскировать продакшн-данные для разработки? PostgreSQL умеет гораздо больше, чем просто `SELECT random()`.

Разберём, как превратить PostgreSQL в генератор случайных данных для реальных задач.

<!--more-->

## 1. Зачем генерировать случайные данные в базе?

### Реальные кейсы из жизни

- **Уникальные ID** - когда UUID слишком длинный, а автоинкремент предсказуемый
- **Тестовые данные** - миллионы записей для нагрузочного тестирования
- **Маскировка данных** - замена реальных имён/телефонов на фейковые
- **Промокоды и купоны** - уникальные коды для маркетинговых акций
- **Токены и API-ключи** - безопасные идентификаторы для интеграций  

**Почему именно в PostgreSQL?**

- Атомарность - всё в одной транзакции
- Производительность - генерация прямо в базе быстрее, чем в коде
- Богатый набор функций - от простого `random()` до сложных алгоритмов

## 2. Базовые функции для генерации

### 🔥 Основные инструменты

```sql
-- Случайное число от 0 до 1
SELECT random();

-- Случайное целое число в диапазоне
SELECT floor(random() * 100)::int; -- 0-99

-- Случайная строка фиксированной длины
SELECT substr(md5(random()::text), 1, 8);

-- UUID (если нужен стандартный)
SELECT gen_random_uuid();
```

### **🔥 Генерация промокодов:**

```sql
-- Простой промокод из букв и цифр
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

-- Использование
SELECT generate_promo_code(10); -- РЕЗУЛЬТАТ: K7M9X2P4Q1
```

### 🔥 Читаемые промокоды (без путаницы 0/O, 1/I)

```sql
CREATE OR REPLACE FUNCTION generate_readable_code(length int DEFAULT 6)
RETURNS text AS $$
DECLARE
    -- Убираем похожие символы
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

-- Пример: SUMMER2024
SELECT 'SUMMER' || generate_readable_code(4);
```

## **3. Продвинутая генерация для реальных задач**

### **🔹 Генерация тестовых пользователей:**

```sql
-- Массовая генерация пользователей
WITH random_users AS (
    SELECT 
        generate_series(1, 10000) as id,
        (ARRAY['Александр', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Елена'])[floor(random() * 6 + 1)] as first_name,
        (ARRAY['Иванов', 'Петров', 'Сидоров', 'Козлов', 'Новиков'])[floor(random() * 5 + 1)] as last_name,
        'user' || generate_series(1, 10000) || '@test.com' as email,
        floor(random() * 80 + 18) as age,
        (random() * 100000)::numeric(10,2) as balance
)
INSERT INTO users (first_name, last_name, email, age, balance)
SELECT first_name, last_name, email, age, balance FROM random_users;
```

### Генерация реалистичных телефонов

```sql
CREATE OR REPLACE FUNCTION generate_phone()
RETURNS text AS $$
BEGIN
    RETURN '+7' || 
           (900 + floor(random() * 99))::text || 
           lpad(floor(random() * 10000000)::text, 7, '0');
END;
$$ LANGUAGE plpgsql;

-- Результат: +79051234567
SELECT generate_phone();
```

### Генерация временных меток

```sql
-- Случайная дата в последние 30 дней
SELECT NOW() - (random() * interval '30 days');

-- Случайное время в рабочие часы
SELECT date_trunc('day', NOW()) + 
       (9 + random() * 9) * interval '1 hour' + 
       (random() * 60) * interval '1 minute';
```

## 4. Безопасная генерация токенов и ключей

### 🔥 Криптографически стойкие токены

```sql
-- Требует расширения pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Безопасный API-ключ
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS text AS $$
BEGIN
    RETURN 'ak_' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Результат: ak_f4e5d6c7b8a9...
SELECT generate_api_key();
```

### 🔥 Токены с проверочной суммой

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

## 5. Оптимизация и производительность

### Массовая генерация с батчингом

```sql
-- Генерация 1 млн промокодов за раз
INSERT INTO promo_codes (code, created_at)
SELECT 
    generate_promo_code(8),
    NOW() + (random() * interval '30 days')
FROM generate_series(1, 1000000);
```

### Избежание дубликатов

```sql
-- Генерация с проверкой уникальности
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

## 6. Практические примеры для бизнеса

### Система скидочных купонов

```sql
-- Создание таблицы купонов
CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(12) UNIQUE NOT NULL,
    discount_percent INT CHECK (discount_percent BETWEEN 1 AND 100),
    valid_until TIMESTAMP,
    usage_limit INT DEFAULT 1,
    used_count INT DEFAULT 0
);

-- Генерация купонов для акции
INSERT INTO coupons (code, discount_percent, valid_until, usage_limit)
SELECT 
    'SALE' || generate_readable_code(6),
    (ARRAY[10, 15, 20, 25])[floor(random() * 4 + 1)],
    NOW() + interval '7 days',
    floor(random() * 100 + 1)
FROM generate_series(1, 1000);
```

### Генерация тестовых заказов

```sql
-- Реалистичные заказы с случайными данными
INSERT INTO orders (user_id, total_amount, status, created_at)
SELECT 
    floor(random() * 10000 + 1),
    (random() * 5000 + 100)::numeric(10,2),
    (ARRAY['pending', 'processing', 'shipped', 'delivered'])[floor(random() * 4 + 1)],
    NOW() - (random() * interval '90 days')
FROM generate_series(1, 50000);
```

## Вывод: PostgreSQL - это не только хранилище

PostgreSQL может быть мощным генератором данных для:
✅ **Разработки** - маскировка продакшн-данных  
✅ **Тестирования** - миллионы реалистичных записей  
✅ **Безопасности** - криптографически стойкие токены  
✅ **Маркетинговых кампаний** - уникальные промокоды и купоны  

Главное правило:
> Генерируйте данные там, где они нужны - прямо в базе. Это быстрее и надёжнее.

**P.S. Какие данные ты генерируешь в своих проектах? Поделись опытом в комментах!** 🚀

```sql
-- Дополнительные ресурсы:
-- - PostgreSQL Random Functions: https://www.postgresql.org/docs/current/functions-math.html
-- - pgcrypto Extension: https://www.postgresql.org/docs/current/pgcrypto.html
-- - Generating Test Data: https://wiki.postgresql.org/wiki/Generating_test_data
-- - PL/pgSQL Documentation: https://www.postgresql.org/docs/current/plpgsql.html
```
