/**
 * localStorage / sessionStorage access that cannot throw.
 *
 * Reading `window.localStorage` itself raises SecurityError in a browser set to
 * block site data ("Block all cookies", some WebViews, sandboxed frames), and
 * `setItem` raises QuotaExceededError when storage is full. One unguarded read
 * inside a render-time snapshot is enough to replace the whole page with Next's
 * "This page couldn't load", so here a failure is a return value, never an
 * exception. The consent store, the theme toggle, the install prompt and the
 * Google tag gate go through these functions.
 *
 * No `typeof window` checks: on the server the bare reference throws too, and
 * the same catch turns that into "nothing stored".
 */
export type StorageKind = 'local' | 'session';

function area(kind: StorageKind): Storage | null {
    // The property access is the part that throws, so it lives in the try.
    try {
        return (kind === 'local' ? window.localStorage : window.sessionStorage) ?? null;
    } catch {
        return null;
    }
}

/** Whether the area can be reached at all. Says nothing about free space. */
export function storageAvailable(kind: StorageKind): boolean {
    return area(kind) !== null;
}

/** The stored string, or null when the key is absent OR storage is unreachable. */
export function readStorage(kind: StorageKind, key: string): string | null {
    try {
        return area(kind)?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

/** False when the value could not be stored, so the caller can keep it in memory. */
export function writeStorage(kind: StorageKind, key: string, value: string): boolean {
    try {
        const storage = area(kind);
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

/** False when the area is unreachable. Removing a key that is not there is a success. */
export function removeStorage(kind: StorageKind, key: string): boolean {
    try {
        const storage = area(kind);
        if (!storage) return false;
        storage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

/** Every key in the area; empty when it cannot be read. */
export function storageKeys(kind: StorageKind): string[] {
    try {
        const storage = area(kind);
        if (!storage) return [];
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key !== null) keys.push(key);
        }
        return keys;
    } catch {
        return [];
    }
}
