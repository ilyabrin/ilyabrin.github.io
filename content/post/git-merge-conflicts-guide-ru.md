---
title: "Как избежать merge-конфликтов: практический гайд для команды"
date: 2025-04-30T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["git", "workflow", "team", "best-practices", "version-control", "merge-conflicts"]
categories: ["Development"]
---

Merge-конфликты — это боль каждой команды. Вроде все пишут код, всё работает, но как только подходит момент мержить ветки — начинается хаос. Конфликты, потерянные коммиты, часы на разбор чужого кода.

Но конфликты — это не техническая проблема. Это проблема процессов. Давайте разберём, как их избежать.

<!--more-->

## Почему возникают конфликты

Конфликты появляются, когда:

- Ветки живут слишком долго
- Разработчики меняют одни и те же файлы
- Нет синхронизации с main
- Отсутствуют правила работы с git

Если конфликты возникают постоянно — у вас проблемы с процессами, а не с git.

## Практики, которые помогут

### 1. Короткие ветки

Чем дольше живёт ветка, тем больше конфликтов:

```bash
# Плохо: ветка живёт неделю
git checkout -b feature/huge-refactoring

# Хорошо: ветка живёт 1-2 дня
git checkout -b feat/add-user-validation
```

Правила:

- Ветка живёт максимум 1-2 дня
- Большие задачи разбивайте на подзадачи
- Каждый день синхронизируйтесь с main

### 2. Именование веток

Плохо:

```sh
fix
bugfix
feature
my-branch
```

Хорошо:

```sh
feat/user-auth-oauth
fix/payment-race-condition
refactor/order-service-cleanup
```

Формат: `тип/короткое-описание`

Типы:

- `feat` — новая функциональность
- `fix` — исправление бага
- `refactor` — рефакторинг
- `docs` — документация
- `test` — тесты

### 3. Rebase перед merge

```bash
# Перед тем как создавать PR
git fetch origin
git rebase origin/main

# Или
git pull --rebase origin main
```

Почему rebase, а не merge:

- История остаётся линейной
- Конфликты решаются постепенно
- Нет лишних merge-коммитов

### 4. Ежедневная синхронизация

```bash
# Каждое утро
git fetch origin
git rebase origin/main

# Или настройте автоматически
git config pull.rebase true
```

Это предотвращает накопление изменений и упрощает разрешение конфликтов.

### 5. Разделение зон ответственности

Если два разработчика постоянно меняют одни файлы — это проблема:

```go
// Плохо: все лезут в один файл
// handlers.go - 2000 строк, 5 человек меняют

// Хорошо: разделили по модулям
// user_handler.go - работает Алиса
// order_handler.go - работает Боб
// payment_handler.go - работает Чарли
```

Решение:

- Договоритесь о зонах ответственности
- Если правки пересекаются — синхронизируйтесь до merge
- Используйте CODEOWNERS файл

### 6. Настройка .gitattributes

Некоторые файлы лучше мержить автоматически:

```bash
# .gitattributes
package-lock.json merge=union
yarn.lock merge=union
*.min.js binary
*.png binary
```

Это предотвращает конфликты в файлах, которые не нужно мержить вручную.

### 7. Инструменты для разрешения конфликтов

Не пытайтесь чинить конфликты в консоли:

```bash
# Настройте merge tool
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'

# Или используйте встроенные
git mergetool
```

Инструменты:

- VS Code (встроенный)
- Meld
- KDiff3
- GitKraken

### 8. Алгоритм разрешения конфликта

Если конфликт всё же случился:

```bash
# 1. Посмотрите, что изменилось
git diff

# 2. Поймите контекст
git log --oneline --graph

# 3. Свяжитесь с автором, если непонятно
git blame <file>

# 4. Разрешите конфликт осознанно
# Не просто "accept theirs" или "accept ours"

# 5. Запустите тесты
go test ./...

# 6. Закоммитьте
git add .
git commit
```

## Чего НЕ делать

### Не мержить "на авось"

```bash
# Плохо
git merge main
# Conflicts? Ладно, возьму их версию
git checkout --theirs .
git add .
git commit -m "fix merge"
```

Так появляются скрытые баги.

### Не игнорировать pre-commit хуки

```bash
# Настройте хуки
# .git/hooks/pre-commit
#!/bin/bash
go fmt ./...
go vet ./...
go test ./...
```

Или используйте husky/lefthook.

### Не мержить без понимания

"Там всего пару строк" — слова перед падением прода.

Всегда понимайте, что мержите.

## Идеальный процесс

```go
type GitWorkflow struct {
    BranchLifetime time.Duration // 1-2 дня
    DailySync      bool          // true
    Rebase         bool          // true
    CodeOwners     bool          // true
    PreCommitHooks bool          // true
}

func (w *GitWorkflow) IsOptimal() bool {
    return w.BranchLifetime <= 48*time.Hour &&
           w.DailySync &&
           w.Rebase &&
           w.CodeOwners &&
           w.PreCommitHooks
}
```

Компоненты:

1. Маленькие PR (< 400 строк)
2. Автоматические проверки (CI/CD)
3. Ежедневная синхронизация
4. Чёткий code ownership
5. Pre-commit хуки

## Автоматизация

### GitHub Actions для проверки конфликтов

```yaml
name: Check Conflicts
on: pull_request

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check for conflicts
        run: |
          git fetch origin main
          git merge-base --is-ancestor origin/main HEAD || exit 1
```

### Pre-commit hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Проверка форматирования
if ! go fmt ./...; then
    echo "Code formatting failed"
    exit 1
fi

# Проверка линтером
if ! golangci-lint run; then
    echo "Linting failed"
    exit 1
fi

# Запуск тестов
if ! go test ./...; then
    echo "Tests failed"
    exit 1
fi
```

## Заключение

Merge-конфликты избежать можно, если:

- Держать ветки короткими
- Синхронизироваться ежедневно
- Использовать rebase
- Разделить зоны ответственности
- Автоматизировать проверки

Главное правило: лучший конфликт — тот, которого не случилось.

Настройте процессы правильно, и конфликты станут редкостью.

## Дополнительные ресурсы

- [Git Documentation on Merging](https://git-scm.com/docs/git-merge)
- [Atlassian Git Tutorials](https://www.atlassian.com/git/tutorials/merging-vs-rebasing)
- [Pro Git Book - Branching and Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)
