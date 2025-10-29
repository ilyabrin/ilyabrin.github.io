---
title: "Как избежать проблем с блокировками в Postgres"
date: 2025-04-25T14:00:14+01:00

author: "Ilya Brin"
categories: ['database', 'postgresql', 'performance', 'optimization']
tags: ['postgresql', 'pg', 'sql', 'locks', 'tips & tricks', 'performance', 'database', 'optimization', 'deadlocks']
---

**Блокировки (locks)** в PostgreSQL - это механизм, который обеспечивает согласованность данных при параллельных операциях. Однако неправильное управление ими может привести к **дедлокам (deadlocks)**, **долгим транзакциям** и **простою приложений**.  

В этой статье разберём:  

- Какие бывают блокировки в Postgres  
- Как обнаруживать конфликты  
- Практические способы избежать проблем  

Кратко и по существу! 🚀  

<!--more-->

## 1. Типы блокировок в PostgreSQL  

Postgres использует несколько уровней блокировок:  

### 1.1. Блокировки на уровне строк (Row-Level Locks)  

- **`FOR UPDATE`** - эксклюзивная блокировка для изменения строки.  
- **`FOR SHARE`** - блокировка для чтения, не дающая другим транзакциям изменять строку.  
- **`FOR NO KEY UPDATE`** - менее строгая версия `FOR UPDATE`, не блокирует индексы по внешним ключам.  

### 1.2. Блокировки на уровне таблиц (Table-Level Locks)  

- **`ACCESS SHARE`** - самая слабая, ставится при `SELECT`.  
- **`ROW EXCLUSIVE`** - возникает при `INSERT`, `UPDATE`, `DELETE`.  
- **`ACCESS EXCLUSIVE`** - самая строгая, блокирует даже `SELECT` (используется при `ALTER TABLE`, `DROP TABLE`).  

### 1.3. Блокировки транзакций (Transaction-Level Locks)  

- **`DEADLOCK`** - когда две транзакции ждут друг друга.  
- **`IDLE IN TRANSACTION`** - транзакция открыта, но не делает запросов (опасно для долгих соединений).  

## 2. Как обнаружить блокировки  

### 2.1. Просмотр активных блокировок  

Запрос для мониторинга текущих блокировок:  

```sql
SELECT blocked_locks.pid AS blocked_pid,
       blocking_locks.pid AS blocking_pid,
       blocked_activity.query AS blocked_query,
       blocking_activity.query AS blocking_query,
       blocked_activity.usename AS blocked_user,
       blocking_activity.usename AS blocking_user
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;
```

### 2.2. Поиск долгих транзакций  

```sql
SELECT pid, usename, query, now() - xact_start AS duration
FROM pg_stat_activity
WHERE state != 'idle' AND now() - xact_start > interval '5 minutes'
ORDER BY duration DESC;
```

## 3. Как избежать проблем с блокировками  

### 3.1. Оптимизация транзакций  

- **Делите большие транзакции на мелкие** (меньше времени → меньше шансов на конфликт).  
- **Избегайте `SELECT ... FOR UPDATE` без необходимости** (используйте `FOR NO KEY UPDATE` или `FOR SHARE`).  
- **Закрывайте idle-транзакции** (настройте `idle_in_transaction_session_timeout`).  

### 3.2. Настройка времени ожидания  

```sql
SET lock_timeout = '5s';       -- запрос упадёт, если не получит блокировку за 5 секунд
SET statement_timeout = '30s'; -- ограничение времени выполнения запроса
```

### 3.3. Использование индексов  

- **Блокировки на строках без индекса могут блокировать всю таблицу** (используйте `EXPLAIN` для проверки плана запроса).  

### 3.4. Осторожность с DDL-операциями  

- **`ALTER TABLE` ставит `ACCESS EXCLUSIVE` блокировку** → делайте в период низкой нагрузки.  
- **Используйте `CONCURRENTLY` для создания индексов**:  

  ```sql
  CREATE INDEX CONCURRENTLY idx_name ON table_name(column);
  ```

### 3.5. Мониторинг и автоматизация  

- **Настройте алерты на долгие транзакции** (через Prometheus + Grafana или pg_stat_activity).  
- **Используйте `pg_stat_statements` для анализа проблемных запросов**.  

## Вывод  

Блокировки в Postgres - неизбежная часть работы, но их можно контролировать:  
✅ **Минимизируйте время транзакций**  
✅ **Избегайте лишних `FOR UPDATE`**  
✅ **Настройте `lock_timeout` и `statement_timeout`**  
✅ **Мониторьте активные блокировки**  

Если внедрить эти практики, можно значительно снизить количество проблем с блокировками в продакшене.  

**Дополнительные ресурсы:**  

- [Официальная документация по блокировкам](https://www.postgresql.org/docs/current/explicit-locking.html)  
- [Статья о дедлоках в Postgres](https://habr.com/ru/articles/465263/)  

🚀 **Как вы справляетесь с блокировками? Делитесь в комментариях!**
