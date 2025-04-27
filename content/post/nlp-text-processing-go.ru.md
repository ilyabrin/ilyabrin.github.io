---
title: "Natural Language Processing: основы обработки текста на Go"
date: 2025-04-27T18:00:00+01:00

author: "Ilya Brin"
categories: ['golang', 'nlp', 'machine-learning']
tags: ['nlp', 'text-processing', 'golang', 'machine-learning', 'tokenization', 'sentiment-analysis', 'text-mining']
---

Привет, лингвист! 👋

Хочешь научить компьютер **понимать человеческий язык**? Анализировать отзывы клиентов, извлекать ключевые слова из документов или определять тональность комментариев?

**Natural Language Processing (NLP)** - это магия, которая превращает неструктурированный текст в **полезные данные**. И да, это можно делать на Go!

Разбираем **основы NLP**, **практические алгоритмы** и **реальные примеры** обработки текста на Go 🚀

<!--more-->

## 1. Что такое NLP и зачем оно нужно

### Определение NLP

**Natural Language Processing** - это область машинного обучения, которая учит компьютеры **понимать**, **интерпретировать** и **генерировать** человеческий язык.

**Примеры задач NLP:**

- **Анализ тональности** - позитивный или негативный отзыв?
- **Извлечение сущностей** - найти имена, даты, места в тексте
- **Классификация текста** - спам или не спам?
- **Машинный перевод** - с русского на английский
- **Генерация текста** - автоматическое написание статей

### Реальные применения

```go
// Примеры использования NLP в бизнесе
type NLPApplication struct {
    Name        string
    Description string
    Value       string
}

var applications = []NLPApplication{
    {"Анализ отзывов", "Определение настроения клиентов", "Улучшение продукта"},
    {"Чат-боты", "Автоматические ответы на вопросы", "Снижение нагрузки на поддержку"},
    {"Поиск по документам", "Семантический поиск в базе знаний", "Быстрый доступ к информации"},
    {"Модерация контента", "Автоматическое выявление токсичности", "Безопасная среда"},
}
```

## 2. Основы обработки текста

### Токенизация - разбиение на части

```go
package nlp

import (
    "regexp"
    "strings"
    "unicode"
)

type Tokenizer struct {
    wordRegex *regexp.Regexp
}

func NewTokenizer() *Tokenizer {
    return &Tokenizer{
        wordRegex: regexp.MustCompile(`\b\w+\b`),
    }
}

func (t *Tokenizer) TokenizeWords(text string) []string {
    text = strings.ToLower(text)
    return t.wordRegex.FindAllString(text, -1)
}

func (t *Tokenizer) TokenizeSentences(text string) []string {
    sentences := regexp.MustCompile(`[.!?]+`).Split(text, -1)
    result := make([]string, 0, len(sentences))
    
    for _, sentence := range sentences {
        sentence = strings.TrimSpace(sentence)
        if sentence != "" {
            result = append(result, sentence)
        }
    }
    
    return result
}
```

### Нормализация текста

```go
func (t *Tokenizer) Normalize(text string) string {
    // Приведение к нижнему регистру
    text = strings.ToLower(text)
    
    // Удаление знаков препинания
    text = regexp.MustCompile(`[^\p{L}\p{N}\s]+`).ReplaceAllString(text, "")
    
    // Удаление лишних пробелов
    text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
    
    return strings.TrimSpace(text)
}

// Удаление стоп-слов
var stopWords = map[string]bool{
    "и": true, "в": true, "на": true, "с": true, "по": true,
    "для": true, "не": true, "от": true, "до": true, "из": true,
    "the": true, "and": true, "or": true, "but": true, "in": true,
    "on": true, "at": true, "to": true, "for": true, "of": true,
}

func RemoveStopWords(tokens []string) []string {
    result := make([]string, 0, len(tokens))
    for _, token := range tokens {
        if !stopWords[token] && len(token) > 2 {
            result = append(result, token)
        }
    }
    return result
}
```

## 3. Анализ тональности (Sentiment Analysis)

### Простой подход на основе словаря

```go
type SentimentAnalyzer struct {
    positiveWords map[string]int
    negativeWords map[string]int
}

func NewSentimentAnalyzer() *SentimentAnalyzer {
    return &SentimentAnalyzer{
        positiveWords: map[string]int{
            "хорошо": 2, "отлично": 3, "прекрасно": 3, "замечательно": 2,
            "good": 2, "great": 3, "excellent": 3, "amazing": 3,
            "love": 2, "perfect": 3, "awesome": 3,
        },
        negativeWords: map[string]int{
            "плохо": -2, "ужасно": -3, "отвратительно": -3, "кошмар": -2,
            "bad": -2, "terrible": -3, "awful": -3, "hate": -3,
            "horrible": -3, "disgusting": -3,
        },
    }
}

type SentimentResult struct {
    Score     int
    Sentiment string
    Confidence float64
}

func (sa *SentimentAnalyzer) Analyze(text string) SentimentResult {
    tokenizer := NewTokenizer()
    tokens := tokenizer.TokenizeWords(text)
    tokens = RemoveStopWords(tokens)
    
    score := 0
    wordCount := 0
    
    for _, token := range tokens {
        if value, exists := sa.positiveWords[token]; exists {
            score += value
            wordCount++
        }
        if value, exists := sa.negativeWords[token]; exists {
            score += value
            wordCount++
        }
    }
    
    sentiment := "neutral"
    confidence := 0.0
    
    if score > 0 {
        sentiment = "positive"
        confidence = float64(score) / float64(len(tokens))
    } else if score < 0 {
        sentiment = "negative"
        confidence = float64(-score) / float64(len(tokens))
    }
    
    return SentimentResult{
        Score:      score,
        Sentiment:  sentiment,
        Confidence: confidence,
    }
}
```

### Использование анализа тональности

```go
func main() {
    analyzer := NewSentimentAnalyzer()
    
    reviews := []string{
        "Этот продукт просто отличный! Очень доволен покупкой.",
        "Ужасное качество, деньги на ветер. Не рекомендую.",
        "Обычный товар, ничего особенного.",
        "Amazing product! Love it so much!",
    }
    
    for _, review := range reviews {
        result := analyzer.Analyze(review)
        fmt.Printf("Отзыв: %s\n", review)
        fmt.Printf("Тональность: %s (%.2f)\n\n", result.Sentiment, result.Confidence)
    }
}
```

## 4. TF-IDF для поиска ключевых слов

### Реализация TF-IDF

```go
import "math"

type TFIDFAnalyzer struct {
    documents [][]string
    vocabulary map[string]int
}

func NewTFIDFAnalyzer() *TFIDFAnalyzer {
    return &TFIDFAnalyzer{
        documents: make([][]string, 0),
        vocabulary: make(map[string]int),
    }
}

func (tfidf *TFIDFAnalyzer) AddDocument(tokens []string) {
    tfidf.documents = append(tfidf.documents, tokens)
    
    // Обновляем словарь
    for _, token := range tokens {
        tfidf.vocabulary[token]++
    }
}

func (tfidf *TFIDFAnalyzer) CalculateTF(tokens []string) map[string]float64 {
    tf := make(map[string]float64)
    totalWords := len(tokens)
    
    for _, token := range tokens {
        tf[token]++
    }
    
    for token := range tf {
        tf[token] = tf[token] / float64(totalWords)
    }
    
    return tf
}

func (tfidf *TFIDFAnalyzer) CalculateIDF(term string) float64 {
    documentsWithTerm := 0
    
    for _, doc := range tfidf.documents {
        for _, token := range doc {
            if token == term {
                documentsWithTerm++
                break
            }
        }
    }
    
    if documentsWithTerm == 0 {
        return 0
    }
    
    return math.Log(float64(len(tfidf.documents)) / float64(documentsWithTerm))
}

func (tfidf *TFIDFAnalyzer) GetTopKeywords(tokens []string, topN int) []KeywordScore {
    tf := tfidf.CalculateTF(tokens)
    scores := make([]KeywordScore, 0)
    
    for term, tfScore := range tf {
        idf := tfidf.CalculateIDF(term)
        tfidfScore := tfScore * idf
        
        scores = append(scores, KeywordScore{
            Word:  term,
            Score: tfidfScore,
        })
    }
    
    // Сортируем по убыванию
    sort.Slice(scores, func(i, j int) bool {
        return scores[i].Score > scores[j].Score
    })
    
    if len(scores) > topN {
        scores = scores[:topN]
    }
    
    return scores
}

type KeywordScore struct {
    Word  string
    Score float64
}
```

## 5. Извлечение именованных сущностей (NER)

### Простой подход с регулярными выражениями

```go
type EntityExtractor struct {
    patterns map[string]*regexp.Regexp
}

func NewEntityExtractor() *EntityExtractor {
    return &EntityExtractor{
        patterns: map[string]*regexp.Regexp{
            "email":  regexp.MustCompile(`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`),
            "phone":  regexp.MustCompile(`\b\d{3}-\d{3}-\d{4}\b|\b\+7\d{10}\b`),
            "date":   regexp.MustCompile(`\b\d{1,2}[./]\d{1,2}[./]\d{4}\b`),
            "money":  regexp.MustCompile(`\$\d+(?:,\d{3})*(?:\.\d{2})?|\d+\s*(?:рублей|руб\.?|долларов)`),
            "person": regexp.MustCompile(`\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\b`),
        },
    }
}

type Entity struct {
    Type  string
    Value string
    Start int
    End   int
}

func (ee *EntityExtractor) Extract(text string) []Entity {
    entities := make([]Entity, 0)
    
    for entityType, pattern := range ee.patterns {
        matches := pattern.FindAllStringIndex(text, -1)
        for _, match := range matches {
            entities = append(entities, Entity{
                Type:  entityType,
                Value: text[match[0]:match[1]],
                Start: match[0],
                End:   match[1],
            })
        }
    }
    
    return entities
}
```

## 6. Классификация текста

### Наивный байесовский классификатор

```go
type NaiveBayesClassifier struct {
    classes     map[string]int
    wordCounts  map[string]map[string]int
    totalWords  map[string]int
    vocabulary  map[string]bool
}

func NewNaiveBayesClassifier() *NaiveBayesClassifier {
    return &NaiveBayesClassifier{
        classes:    make(map[string]int),
        wordCounts: make(map[string]map[string]int),
        totalWords: make(map[string]int),
        vocabulary: make(map[string]bool),
    }
}

func (nb *NaiveBayesClassifier) Train(text string, class string) {
    tokenizer := NewTokenizer()
    tokens := tokenizer.TokenizeWords(text)
    tokens = RemoveStopWords(tokens)
    
    nb.classes[class]++
    
    if nb.wordCounts[class] == nil {
        nb.wordCounts[class] = make(map[string]int)
    }
    
    for _, token := range tokens {
        nb.wordCounts[class][token]++
        nb.totalWords[class]++
        nb.vocabulary[token] = true
    }
}

func (nb *NaiveBayesClassifier) Predict(text string) string {
    tokenizer := NewTokenizer()
    tokens := tokenizer.TokenizeWords(text)
    tokens = RemoveStopWords(tokens)
    
    bestClass := ""
    bestScore := math.Inf(-1)
    
    totalDocs := 0
    for _, count := range nb.classes {
        totalDocs += count
    }
    
    for class := range nb.classes {
        score := math.Log(float64(nb.classes[class]) / float64(totalDocs))
        
        for _, token := range tokens {
            wordCount := nb.wordCounts[class][token]
            totalWordsInClass := nb.totalWords[class]
            vocabularySize := len(nb.vocabulary)
            
            // Лапласовское сглаживание
            probability := float64(wordCount+1) / float64(totalWordsInClass+vocabularySize)
            score += math.Log(probability)
        }
        
        if score > bestScore {
            bestScore = score
            bestClass = class
        }
    }
    
    return bestClass
}
```

## 7. Практический пример: анализ отзывов

### Полная система анализа

```go
type ReviewAnalyzer struct {
    sentiment   *SentimentAnalyzer
    classifier  *NaiveBayesClassifier
    extractor   *EntityExtractor
    tfidf       *TFIDFAnalyzer
}

func NewReviewAnalyzer() *ReviewAnalyzer {
    return &ReviewAnalyzer{
        sentiment:  NewSentimentAnalyzer(),
        classifier: NewNaiveBayesClassifier(),
        extractor:  NewEntityExtractor(),
        tfidf:      NewTFIDFAnalyzer(),
    }
}

type ReviewAnalysis struct {
    Text       string
    Sentiment  SentimentResult
    Category   string
    Keywords   []KeywordScore
    Entities   []Entity
}

func (ra *ReviewAnalyzer) AnalyzeReview(text string) ReviewAnalysis {
    tokenizer := NewTokenizer()
    tokens := tokenizer.TokenizeWords(text)
    cleanTokens := RemoveStopWords(tokens)
    
    return ReviewAnalysis{
        Text:      text,
        Sentiment: ra.sentiment.Analyze(text),
        Category:  ra.classifier.Predict(text),
        Keywords:  ra.tfidf.GetTopKeywords(cleanTokens, 5),
        Entities:  ra.extractor.Extract(text),
    }
}

// Пример использования
func main() {
    analyzer := NewReviewAnalyzer()
    
    // Обучаем классификатор
    analyzer.classifier.Train("Отличный товар, быстрая доставка", "positive")
    analyzer.classifier.Train("Плохое качество, не рекомендую", "negative")
    
    // Добавляем документы для TF-IDF
    tokenizer := NewTokenizer()
    doc1 := RemoveStopWords(tokenizer.TokenizeWords("Отличный товар"))
    analyzer.tfidf.AddDocument(doc1)
    
    // Анализируем отзыв
    review := "Заказал 15.01.2025, товар пришел быстро. Качество отличное! Рекомендую всем. Мой email: test@example.com"
    
    result := analyzer.AnalyzeReview(review)
    
    fmt.Printf("Анализ отзыва:\n")
    fmt.Printf("Тональность: %s (%.2f)\n", result.Sentiment.Sentiment, result.Sentiment.Confidence)
    fmt.Printf("Категория: %s\n", result.Category)
    fmt.Printf("Найденные сущности:\n")
    for _, entity := range result.Entities {
        fmt.Printf("  %s: %s\n", entity.Type, entity.Value)
    }
}
```

## 8. Производительность и оптимизация

### Бенчмарки

```go
func BenchmarkTokenization(b *testing.B) {
    tokenizer := NewTokenizer()
    text := "Это длинный текст для тестирования производительности токенизации в Go"
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        tokenizer.TokenizeWords(text)
    }
}

func BenchmarkSentimentAnalysis(b *testing.B) {
    analyzer := NewSentimentAnalyzer()
    text := "Отличный продукт, очень доволен покупкой, рекомендую всем"
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        analyzer.Analyze(text)
    }
}

// Результаты:
// BenchmarkTokenization-8      1000000    1200 ns/op
// BenchmarkSentimentAnalysis-8  500000    2400 ns/op
```

### Оптимизации

```go
// Кеширование результатов
type CachedAnalyzer struct {
    analyzer *SentimentAnalyzer
    cache    map[string]SentimentResult
    mu       sync.RWMutex
}

func (ca *CachedAnalyzer) Analyze(text string) SentimentResult {
    ca.mu.RLock()
    if result, exists := ca.cache[text]; exists {
        ca.mu.RUnlock()
        return result
    }
    ca.mu.RUnlock()
    
    result := ca.analyzer.Analyze(text)
    
    ca.mu.Lock()
    ca.cache[text] = result
    ca.mu.Unlock()
    
    return result
}
```

## 9. Интеграция с внешними API

### Использование Google Translate API

```go
type TranslationService struct {
    apiKey string
    client *http.Client
}

func (ts *TranslationService) Translate(text, targetLang string) (string, error) {
    url := fmt.Sprintf("https://translation.googleapis.com/language/translate/v2?key=%s", ts.apiKey)
    
    payload := map[string]interface{}{
        "q":      text,
        "target": targetLang,
        "format": "text",
    }
    
    jsonData, _ := json.Marshal(payload)
    resp, err := ts.client.Post(url, "application/json", bytes.NewBuffer(jsonData))
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()
    
    var result struct {
        Data struct {
            Translations []struct {
                TranslatedText string `json:"translatedText"`
            } `json:"translations"`
        } `json:"data"`
    }
    
    json.NewDecoder(resp.Body).Decode(&result)
    
    if len(result.Data.Translations) > 0 {
        return result.Data.Translations[0].TranslatedText, nil
    }
    
    return "", fmt.Errorf("no translation found")
}
```

## Вывод: NLP на Go - это реально и эффективно

**Что мы изучили:**
🔤 **Токенизация** - разбиение текста на части  
😊 **Анализ тональности** - определение эмоций  
🔍 **TF-IDF** - поиск ключевых слов  
🏷️ **NER** - извлечение именованных сущностей  
📊 **Классификация** - категоризация текста  

**Преимущества Go для NLP:**

- **Высокая производительность** - быстрая обработка больших объемов текста
- **Простота развертывания** - один бинарный файл
- **Отличная поддержка concurrency** - параллельная обработка документов
- **Богатая стандартная библиотека** - regexp, strings, unicode

**Следующие шаги:**

- Изучи библиотеки: `prose`, `go-nlp`, `gse`
- Попробуй интеграцию с ML-моделями через gRPC
- Реализуй word embeddings с Word2Vec

**P.S. Какие NLP-задачи решаете вы? Делитесь опытом!** 🚀

```go
// Дополнительные ресурсы:
// - "Speech and Language Processing" - Jurafsky & Martin
// - Go NLP libraries: github.com/jdkato/prose
// - Stanford NLP Course: cs224n.stanford.edu
```
