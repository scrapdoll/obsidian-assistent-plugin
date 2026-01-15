# Спецификация рефакторинга ChatView

## Обзор

Текущий файл `src/chatView.tsx` содержит 1213 строк кода и смешивает множество обязанностей: UI компоненты, бизнес-логику, утилитарные функции, типы и Obsidian-интеграцию. Цель рефакторинга — сделать код более модульным, тестируемым, поддерживаемым и идиоматичным для React/TypeScript.

## Текущие проблемы

### 1. Размер файла и смешение ответственности
- **Проблема**: 1213 строк в одном файле
- **Последствия**: Сложность навигации, тестирования и поддержки
- **Решение**: Разделить на модули по ответственности

### 2. Слишком много состояния в одном компоненте
- **Проблема**: 9 useState и 6 useRef в `ChatView`
- **Последствия**: Сложность понимания потока данных, потенциальные race conditions
- **Решение**: Вынести логику в кастомные хуки

### 3. Слишком много эффектов
- **Проблема**: 6 useEffect в одном компоненте
- **Последствия**: Сложность отладки, потенциальные утечки памяти
- **Решение**: Группировать эффекты по функциональности

### 4. Отсутствие модульности
- **Проблема**: Все типы, утилиты, компоненты в одном файле
- **Последствия**: Невозможность повторного использования, сложность тестирования
- **Решение**: Разделить на отдельные файлы

### 5. Дублирование кода
- **Проблема**: Похожая логика обработки ошибок в разных местах
- **Последствия**: Сложность поддержки, потенциальные баги
- **Решение**: Создать централизованные утилиты

### 6. Сложные утилитарные функции
- **Проблема**: `isPromptParamError` (67 строк), `formatError` (24 строки)
- **Последствия**: Сложность понимания и тестирования
- **Решение**: Разбить на более мелкие функции

### 7. Отсутствие валидации
- **Проблема**: Нет валидации входных данных
- **Последствия**: Потенциальные runtime ошибки
- **Решение**: Добавить валидацию на уровне типов и runtime

### 8. Отсутствие обработки edge cases
- **Проблема**: Не все сценарии обрабатываются
- **Последствия**: Нестабильная работа
- **Решение**: Добавить обработку edge cases

### 9. Смешивание UI и логики
- **Проблема**: Бизнес-логика внутри render-функции
- **Последствия**: Сложность тестирования UI
- **Решение**: Вынести логику в хуки и сервисы

### 10. Отсутствие документации
- **Проблема**: Нет JSDoc комментариев
- **Последствия**: Сложность понимания кода другими разработчиками
- **Решение**: Добавить документацию

## Целевая архитектура

### Структура файлов

```
src/chatView/
├── types.ts                    # Все типы и интерфейсы
├── constants.ts                # Константы
├── utils/
│   ├── errorUtils.ts          # Обработка ошибок
│   ├── fileUtils.ts           # Работа с файлами
│   ├── pathUtils.ts           # Работа с путями
│   ├── formatUtils.ts         # Форматирование данных
│   └── validationUtils.ts    # Валидация
├── hooks/
│   ├── useChatMessages.ts     # Управление сообщениями
│   ├── usePermissions.ts      # Управление разрешениями
│   ├── useAttachments.ts      # Управление вложениями
│   ├── useChatSession.ts      # Управление сессией
│   ├── useAutoAttachment.ts   # Авто-вложения
│   └── useDragAndDrop.ts      # Drag & drop
├── components/
│   ├── ChatHeader.tsx         # Заголовок чата
│   ├── MessageList.tsx         # Список сообщений
│   ├── MessageItem.tsx         # Отдельное сообщение
│   ├── PermissionDialog.tsx   # Диалог разрешений
│   ├── AttachmentList.tsx      # Список вложений
│   ├── AttachmentItem.tsx      # Отдельное вложение
│   ├── ChatInput.tsx           # Поле ввода
│   └── StatusIndicator.tsx     # Индикатор статуса
├── ChatView.tsx                # Основной компонент
├── AttachmentFileModal.ts      # Модальное окно выбора файла
└── AssistantChatView.ts        # Obsidian View
```

### Детальное описание модулей

#### types.ts
Все типы и интерфейсы для чата:

```typescript
// Роль сообщения
enum ChatMessageRole {
    Assistant = "assistant",
    User = "user",
    System = "system"
}

// Сообщение чата
interface ChatMessage {
    id: string;
    role: ChatMessageRole;
    content: string;
    timestamp?: number;
}

// Источник вложения
enum AttachmentSource {
    Auto = "auto",
    Manual = "manual"
}

// Тип вложения
enum AttachmentKind {
    Text = "text",
    Binary = "binary"
}

// Режим вложения
enum AttachmentMode {
    Inline = "inline",
    Reference = "reference"
}

// Вложение
interface Attachment {
    id: string;
    path: string;
    name: string;
    size: number;
    kind: AttachmentKind;
    mode: AttachmentMode;
    content?: string;
    source: AttachmentSource;
}

// Состояние запроса разрешения
interface PermissionRequestState {
    id: string;
    request: RequestPermissionRequest;
    resolve: (response: RequestPermissionResponse) => void;
}

// Пропсы для ChatView
interface ChatViewProps {
    client: AcpClient;
    app: App;
}

// Состояние чата
type ChatStatus = "connecting" | "ready" | "error";

// Тон статуса
type StatusTone = "error" | "busy" | "connecting" | "ready";

// Тон опции разрешения
type PermissionOptionTone = "allow" | "reject" | "neutral";
```

#### constants.ts
Все константы:

```typescript
// Типы файлов, которые считаются текстовыми
const TEXT_EXTENSIONS = new Set([
    "md", "mdx", "txt", "json", "yaml", "yml", "toml",
    "ini", "conf", "log", "csv", "ts", "tsx", "js", "jsx",
    "mjs", "cjs", "css", "scss", "html", "xml", "sh",
    "py", "rb", "go", "rs", "java", "kt", "swift",
    "c", "cpp", "h", "hpp", "cs", "php", "sql"
]);

// Лимит размера для inline вложений (300KB)
const INLINE_ATTACHMENT_LIMIT = 300 * 1024;

// Типы view
const VIEW_TYPE_EXAMPLE = "example-view";

// Сообщения UI
const UI_MESSAGES = {
    EMPTY_STATE: "Start a conversation to see responses here.",
    PERMISSION_REQUIRED: "Permission required",
    TOOL_CALL_ID: "Tool call ID:",
    PENDING_PERMISSIONS: "more pending",
    CANCEL_REQUEST: "Cancel request",
    ATTACH: "Attach",
    REMOVE: "Remove",
    SEND: "Send",
    PLACEHOLDER: "Ask the assistant"
} as const;
```

#### utils/errorUtils.ts
Обработка ошибок:

```typescript
/**
 * Форматирует детали ошибки для отображения
 * @param data - Данные ошибки
 * @returns Отформатированная строка с деталями
 */
function formatErrorDetails(data: unknown): string;

/**
 * Проверяет, является ли ошибкой параметра prompt
 * @param error - Ошибка для проверки
 * @returns true, если это ошибка параметра prompt
 */
function isPromptParamError(error: unknown): boolean;

/**
 * Форматирует ошибку для отображения пользователю
 * @param error - Ошибка для форматирования
 * @returns Отформатированное сообщение об ошибке
 */
function formatError(error: unknown): string;

/**
 * Создает безопасное строковое представление объекта
 * @param value - Значение для преобразования
 * @returns Строковое представление
 */
function safeStringify(value: unknown): string;
```

#### utils/fileUtils.ts
Работа с файлами:

```typescript
/**
 * Проверяет, является ли файл текстовым
 * @param file - Файл для проверки
 * @returns true, если файл текстовый
 */
function isTextFile(file: TFile): boolean;

/**
 * Строит объект вложения из файла
 * @param file - Файл
 * @param source - Источник вложения
 * @param app - Экземпляр приложения Obsidian
 * @returns Объект вложения
 */
async function buildAttachment(
    file: TFile,
    source: AttachmentSource,
    app: App
): Promise<Attachment>;

/**
 * Читает содержимое файла
 * @param file - Файл для чтения
 * @param app - Экземпляр приложения Obsidian
 * @returns Содержимое файла
 */
async function readFileContent(
    file: TFile,
    app: App
): Promise<string | null>;
```

#### utils/pathUtils.ts
Работа с путями:

```typescript
/**
 * Нормализует слеши в пути
 * @param value - Путь для нормализации
 * @returns Путь с нормализованными слешами
 */
function normalizeSlashes(value: string): string;

/**
 * Получает базовый путь к vault
 * @param app - Экземпляр приложения Obsidian
 * @returns Базовый путь к vault или null
 */
function getVaultBasePath(app: App): string | null;

/**
 * Преобразует путь в относительный к vault
 * @param app - Экземпляр приложения Obsidian
 * @param inputPath - Входной путь
 * @returns Относительный путь или null
 */
function toVaultRelativePath(app: App, inputPath: string): string | null;

/**
 * Кодирует путь для использования в URI
 * @param path - Путь для кодирования
 * @returns Закодированный путь
 */
function encodeVaultPath(path: string): string;

/**
 * Преобразует путь в vault URI
 * @param path - Путь для преобразования
 * @returns Vault URI
 */
function toVaultUri(path: string): string;

/**
 * Разрешает obsidian://open URL в файл
 * @param app - Экземпляр приложения Obsidian
 * @param candidate - Кандидат URL
 * @returns Файл или null
 */
function resolveObsidianOpenUrl(app: App, candidate: string): TFile | null;
```

#### utils/formatUtils.ts
Форматирование данных:

```typescript
/**
 * Форматирует байты в читаемый формат
 * @param bytes - Количество байт
 * @returns Отформатированная строка (например, "1.5 MB")
 */
function formatBytes(bytes: number): string;

/**
 * Преобразует содержимое блока в текст
 * @param content - Блок содержимого
 * @returns Текстовое представление
 */
function contentToText(content: ContentBlock): string;

/**
 * Описывает вызов инструмента
 * @param prefix - Префикс описания
 * @param toolCall - Вызов инструмента
 * @returns Описание вызова
 */
function describeToolCall(
    prefix: string,
    toolCall: ToolCall | ToolCallUpdate
): string;

/**
 * Форматирует заголовок запроса разрешения
 * @param request - Запрос разрешения
 * @returns Отформатированный заголовок
 */
function formatPermissionTitle(request: RequestPermissionRequest): string;

/**
 * Форматирует входные данные разрешения
 * @param input - Входные данные
 * @returns Отформатированная строка или null
 */
function formatPermissionInput(input: unknown): string | null;

/**
 * Определяет тон опции разрешения
 * @param option - Опция разрешения
 * @returns Тон опции
 */
function getPermissionOptionTone(option: PermissionOption): PermissionOptionTone;
```

#### utils/validationUtils.ts
Валидация данных:

```typescript
/**
 * Проверяет валидность пути
 * @param path - Путь для проверки
 * @returns true, если путь валиден
 */
function isValidPath(path: string): boolean;

/**
 * Проверяет, является ли файл допустимым для вложения
 * @param file - Файл для проверки
 * @returns true, если файл допустим
 */
function isValidAttachmentFile(file: TFile): boolean;

/**
 * Проверяет валидность сообщения
 * @param message - Сообщение для проверки
 * @returns true, если сообщение валидно
 */
function isValidMessage(message: ChatMessage): boolean;

/**
 * Проверяет валидность вложения
 * @param attachment - Вложение для проверки
 * @returns true, если вложение валидно
 */
function isValidAttachment(attachment: Attachment): boolean;
```

#### hooks/useChatMessages.ts
Управление сообщениями:

```typescript
/**
 * Хук для управления сообщениями чата
 * @returns Объект с методами и состоянием сообщений
 */
function useChatMessages() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const activeAssistantIdRef = useRef<string | null>(null);

    const appendMessage = useCallback((role: ChatMessageRole, content: string) => {
        // Реализация
    }, []);

    const appendAssistantText = useCallback((text: string) => {
        // Реализация
    }, []);

    const clearMessages = useCallback(() => {
        // Реализация
    }, []);

    return {
        messages,
        appendMessage,
        appendAssistantText,
        clearMessages
    };
}
```

#### hooks/usePermissions.ts
Управление разрешениями:

```typescript
/**
 * Хук для управления запросами разрешений
 * @param client - ACP клиент
 * @returns Объект с методами и состоянием разрешений
 */
function usePermissions(client: AcpClient) {
    const [permissionQueue, setPermissionQueue] = useState<PermissionRequestState[]>([]);
    const permissionQueueRef = useRef<PermissionRequestState[]>([]);

    const enqueuePermissionRequest = useCallback((entry: PermissionRequestState) => {
        // Реализация
    }, []);

    const resolvePermissionRequest = useCallback(
        (outcome: RequestPermissionResponse["outcome"]) => {
            // Реализация
        },
        []
    );

    const handlePermissionSelect = useCallback((option: PermissionOption) => {
        // Реализация
    }, []);

    const handlePermissionCancel = useCallback(() => {
        // Реализация
    }, []);

    return {
        permissionQueue,
        activePermission: permissionQueue[0] ?? null,
        pendingPermissionCount: Math.max(permissionQueue.length - 1, 0),
        handlePermissionSelect,
        handlePermissionCancel
    };
}
```

#### hooks/useAttachments.ts
Управление вложениями:

```typescript
/**
 * Хук для управления вложениями
 * @param app - Экземпляр приложения Obsidian
 * @param appendMessage - Функция для добавления сообщений
 * @returns Объект с методами и состоянием вложений
 */
function useAttachments(app: App, appendMessage: (role: ChatMessageRole, content: string) => void) {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const attachmentsRef = useRef<Attachment[]>([]);

    useEffect(() => {
        attachmentsRef.current = attachments;
    }, [attachments]);

    const addAttachment = useCallback((attachment: Attachment) => {
        // Реализация
    }, []);

    const removeAttachment = useCallback((id: string) => {
        // Реализация
    }, []);

    const clearAttachments = useCallback(() => {
        // Реализация
    }, []);

    return {
        attachments,
        attachmentsRef,
        addAttachment,
        removeAttachment,
        clearAttachments
    };
}
```

#### hooks/useChatSession.ts
Управление сессией чата:

```typescript
/**
 * Хук для управления сессией чата
 * @param client - ACP клиент
 * @param appendMessage - Функция для добавления сообщений
 * @returns Объект с методами и состоянием сессии
 */
function useChatSession(
    client: AcpClient,
    appendMessage: (role: ChatMessageRole, content: string) => void
) {
    const [status, setStatus] = useState<ChatStatus>("connecting");
    const [error, setError] = useState<string | null>(null);

    const connect = useCallback(async () => {
        // Реализация
    }, [client]);

    const disconnect = useCallback(() => {
        // Реализация
    }, []);

    useEffect(() => {
        void connect();
        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    return {
        status,
        error,
        connect,
        disconnect
    };
}
```

#### hooks/useAutoAttachment.ts
Автоматическое вложение активного файла:

```typescript
/**
 * Хук для автоматического вложения активного файла
 * @param app - Экземпляр приложения Obsidian
 * @param buildAttachment - Функция для построения вложения
 * @param addAttachment - Функция для добавления вложения
 * @returns Объект с методами и состоянием
 */
function useAutoAttachment(
    app: App,
    buildAttachment: (file: TFile, source: AttachmentSource) => Promise<Attachment>,
    addAttachment: (attachment: Attachment) => void
) {
    const autoAttachSuppressedRef = useRef(false);
    const autoAttachRequestIdRef = useRef(0);

    const ensureAutoAttachment = useCallback(async () => {
        // Реализация
    }, [app, buildAttachment, addAttachment]);

    const suppressAutoAttachment = useCallback(() => {
        // Реализация
    }, []);

    const enableAutoAttachment = useCallback(() => {
        // Реализация
    }, []);

    useEffect(() => {
        void ensureAutoAttachment();
        const ref = app.workspace.on("file-open", () => {
            void ensureAutoAttachment();
        });

        return () => {
            app.workspace.offref(ref);
        };
    }, [app, ensureAutoAttachment]);

    return {
        ensureAutoAttachment,
        suppressAutoAttachment,
        enableAutoAttachment
    };
}
```

#### hooks/useDragAndDrop.ts
Обработка drag and drop:

```typescript
/**
 * Хук для обработки drag and drop файлов
 * @param app - Экземпляр приложения Obsidian
 * @param addAttachmentFromFile - Функция для добавления файла
 * @param appendMessage - Функция для добавления сообщений
 * @returns Объект с методами и состоянием
 */
function useDragAndDrop(
    app: App,
    addAttachmentFromFile: (file: TFile, source: AttachmentSource) => Promise<void>,
    appendMessage: (role: ChatMessageRole, content: string) => void
) {
    const [isDragActive, setIsDragActive] = useState(false);

    const extractDropPaths = useCallback((data: DataTransfer): string[] => {
        // Реализация
    }, []);

    const resolveDropPath = useCallback((candidate: string): TFile | null => {
        // Реализация
    }, [app]);

    const addAttachmentsFromPaths = useCallback(async (paths: string[]) => {
        // Реализация
    }, [resolveDropPath, addAttachmentFromFile, appendMessage]);

    const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
        // Реализация
    }, [addAttachmentsFromPaths]);

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        // Реализация
    }, []);

    const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
        // Реализация
    }, []);

    return {
        isDragActive,
        handleDrop,
        handleDragOver,
        handleDragLeave
    };
}
```

#### components/ChatHeader.tsx
Заголовок чата:

```typescript
interface ChatHeaderProps {
    status: ChatStatus;
    isSending: boolean;
}

/**
 * Компонент заголовка чата
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function ChatHeader({ status, isSending }: ChatHeaderProps): JSX.Element;
```

#### components/MessageList.tsx
Список сообщений:

```typescript
interface MessageListProps {
    messages: ChatMessage[];
    isEmpty?: boolean;
}

/**
 * Компонент списка сообщений
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function MessageList({ messages, isEmpty }: MessageListProps): JSX.Element;
```

#### components/MessageItem.tsx
Отдельное сообщение:

```typescript
interface MessageItemProps {
    message: ChatMessage;
}

/**
 * Компонент отдельного сообщения
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function MessageItem({ message }: MessageItemProps): JSX.Element;
```

#### components/PermissionDialog.tsx
Диалог разрешений:

```typescript
interface PermissionDialogProps {
    activePermission: PermissionRequestState | null;
    pendingPermissionCount: number;
    onSelect: (option: PermissionOption) => void;
    onCancel: () => void;
}

/**
 * Компонент диалога разрешений
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function PermissionDialog({
    activePermission,
    pendingPermissionCount,
    onSelect,
    onCancel
}: PermissionDialogProps): JSX.Element;
```

#### components/AttachmentList.tsx
Список вложений:

```typescript
interface AttachmentListProps {
    attachments: Attachment[];
    onRemove: (id: string) => void;
}

/**
 * Компонент списка вложений
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function AttachmentList({ attachments, onRemove }: AttachmentListProps): JSX.Element;
```

#### components/AttachmentItem.tsx
Отдельное вложение:

```typescript
interface AttachmentItemProps {
    attachment: Attachment;
    onRemove: () => void;
}

/**
 * Компонент отдельного вложения
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function AttachmentItem({ attachment, onRemove }: AttachmentItemProps): JSX.Element;
```

#### components/ChatInput.tsx
Поле ввода:

```typescript
interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onAttach: () => void;
    attachments: Attachment[];
    onAttachmentRemove: (id: string) => void;
    isSending: boolean;
    status: ChatStatus;
    isDragActive: boolean;
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
}

/**
 * Компонент поля ввода
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function ChatInput({
    value,
    onChange,
    onSend,
    onAttach,
    attachments,
    onAttachmentRemove,
    isSending,
    status,
    isDragActive,
    onDrop,
    onDragOver,
    onDragLeave
}: ChatInputProps): JSX.Element;
```

#### components/StatusIndicator.tsx
Индикатор статуса:

```typescript
interface StatusIndicatorProps {
    status: ChatStatus;
    isSending: boolean;
}

/**
 * Компонент индикатора статуса
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
function StatusIndicator({ status, isSending }: StatusIndicatorProps): JSX.Element;
```

#### ChatView.tsx
Основной компонент (упрощенный):

```typescript
/**
 * Основной компонент чата
 * @param props - Пропсы компонента
 * @returns JSX элемент
 */
export const ChatView = ({ client, app }: ChatViewProps) => {
    const {
        messages,
        appendMessage,
        appendAssistantText
    } = useChatMessages();

    const {
        permissionQueue,
        activePermission,
        pendingPermissionCount,
        handlePermissionSelect,
        handlePermissionCancel
    } = usePermissions(client);

    const {
        attachments,
        attachmentsRef,
        addAttachment,
        removeAttachment,
        clearAttachments
    } = useAttachments(app, appendMessage);

    const { status, error } = useChatSession(client, appendMessage);

    const {
        ensureAutoAttachment,
        suppressAutoAttachment,
        enableAutoAttachment
    } = useAutoAttachment(app, buildAttachment, addAttachment);

    const {
        isDragActive,
        handleDrop,
        handleDragOver,
        handleDragLeave
    } = useDragAndDrop(app, addAttachmentFromFile, appendMessage);

    // Остальная логика...

    return (
        <div className="assistant-chat-root">
            <ChatHeader status={status} isSending={isSending} />
            <MessageList messages={messages} />
            {activePermission && (
                <PermissionDialog
                    activePermission={activePermission}
                    pendingPermissionCount={pendingPermissionCount}
                    onSelect={handlePermissionSelect}
                    onCancel={handlePermissionCancel}
                />
            )}
            {error && <div className="assistant-chat-error">{error}</div>}
            <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                onAttach={handleAttachClick}
                attachments={attachments}
                onAttachmentRemove={handleAttachmentRemove}
                isSending={isSending}
                status={status}
                isDragActive={isDragActive}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            />
        </div>
    );
};
```

## План реализации

### Этап 1: Подготовка
1. Создать структуру директорий
2. Создать файлы типов и констант
3. Перенести типы в `types.ts`
4. Перенести константы в `constants.ts`

### Этап 2: Утилиты
1. Создать `utils/errorUtils.ts`
2. Создать `utils/fileUtils.ts`
3. Создать `utils/pathUtils.ts`
4. Создать `utils/formatUtils.ts`
5. Создать `utils/validationUtils.ts`
6. Перенести и рефакторить утилитарные функции
7. Добавить JSDoc комментарии
8. Написать unit тесты

### Этап 3: Хуки
1. Создать `hooks/useChatMessages.ts`
2. Создать `hooks/usePermissions.ts`
3. Создать `hooks/useAttachments.ts`
4. Создать `hooks/useChatSession.ts`
5. Создать `hooks/useAutoAttachment.ts`
6. Создать `hooks/useDragAndDrop.ts`
7. Перенести логику из ChatView в хуки
8. Написать тесты для хуков

### Этап 4: Компоненты
1. Создать `components/ChatHeader.tsx`
2. Создать `components/MessageList.tsx`
3. Создать `components/MessageItem.tsx`
4. Создать `components/PermissionDialog.tsx`
5. Создать `components/AttachmentList.tsx`
6. Создать `components/AttachmentItem.tsx`
7. Создать `components/ChatInput.tsx`
8. Создать `components/StatusIndicator.tsx`
9. Использовать React.memo для оптимизации
10. Написать тесты для компонентов

### Этап 5: Рефакторинг ChatView
1. Упростить ChatView, используя новые хуки и компоненты
2. Удалить дублирующийся код
3. Добавить валидацию
4. Улучшить обработку ошибок
5. Добавить JSDoc комментарии

### Этап 6: Рефакторинг Obsidian интеграции
1. Вынести `AttachmentFileModal` в отдельный файл
2. Вынести `AssistantChatView` в отдельный файл
3. Улучшить обработку жизненного цикла
4. Добавить очистку ресурсов

### Этап 7: Тестирование
1. Написать интеграционные тесты
2. Протестировать edge cases
3. Протестировать производительность
4. Проверить утечки памяти

### Этап 8: Документация
1. Обновить README
2. Добавить примеры использования
3. Добавить архитектурную документацию
4. Добавить руководство по внесению изменений

## Критерии успеха

### Функциональные критерии
- [ ] Все существующие функции работают корректно
- [ ] Нет регрессий в функциональности
- [ ] Обработаны все edge cases
- [ ] Добавлена валидация входных данных

### Критерии качества кода
- [ ] Каждый файл не превышает 300 строк
- [ ] Каждая функция не превышает 50 строк
- [ ] Покрытие тестами не менее 80%
- [ ] Нет дублирования кода
- [ ] Все функции имеют JSDoc комментарии

### Критерии производительности
- [ ] Время рендеринга не увеличилось
- [ ] Нет утечек памяти
- [ ] Оптимизированы повторные рендеринги
- [ ] Использованы React.memo, useMemo, useCallback

### Критерии поддерживаемости
- [ ] Четкое разделение ответственности
- [ ] Понятная структура файлов
- [ ] Хорошие имена переменных и функций
- [ ] Полная документация

## Риски и митигация

### Риск 1: Потеря функциональности при рефакторинге
**Митигация**:
- Полное тестирование перед каждым этапом
- Использование feature flags для постепенного внедрения
- Сохранение старого кода до полной проверки

### Риск 2: Увеличение сложности из-за большого количества файлов
**Митигация**:
- Четкая документация структуры
- Использование barrel exports для упрощения импортов
- Хорошие имена файлов и директорий

### Риск 3: Проблемы с производительностью
**Митигация**:
- Профилирование до и после рефакторинга
- Использование React.memo для компонентов
- Оптимизация хуков

### Риск 4: Сложность миграции существующего кода
**Митигация**:
- Постепенная миграция по модулям
- Сохранение обратной совместимости где возможно
- Четкое руководство по миграции

## Дополнительные улучшения

### Оптимизация производительности
1. Виртуализация длинных списков сообщений
2. Ленивая загрузка компонентов
3. Оптимизация размера бандла
4. Кэширование результатов вычислений

### Улучшение UX
1. Анимации для плавных переходов
2. Индикаторы загрузки для долгих операций
3. Горячие клавиши для частых действий
4. Темы оформления

### Улучшение доступности
1. ARIA атрибуты для всех интерактивных элементов
2. Поддержка навигации с клавиатуры
3. Поддержка screen readers
4. Высокий контраст для текста

### Улучшение безопасности
1. Санитизация пользовательского ввода
2. Валидация всех внешних данных
3. Защита от XSS атак
4. Безопасное хранение чувствительных данных

## Заключение

Рефакторинг `chatView.tsx` значительно улучшит качество кода, его поддерживаемость и тестируемость. Разделение на модули позволит легче добавлять новые функции и исправлять баги. Использование современных паттернов React сделает код более идиоматичным и эффективным.
