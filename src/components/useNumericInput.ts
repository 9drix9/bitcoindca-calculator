'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { readNumericText, readTypedBeforeLoad, type LimitHit, type NumericLimits } from '@/utils/numericInput';

/**
 * Numeric field that tolerates being empty while the user types.
 *
 * Binding the input straight to the number state meant clearing the field
 * snapped it back to a forced value mid-keystroke — on mobile, backspacing
 * "50" to type "75" produced "0", then "075". The text is the source of truth
 * while focused; the parsed number updates live when valid and the text
 * resnaps to the committed number on blur or when a preset/URL changes it.
 *
 * A number outside `limits` is replaced by the nearer end, and `limitHit` says
 * so. Done in silence, 75 typed into the fee field would stay on screen as 75
 * while 50 is used, then turn into 50 on blur with no word of why. `limitHit`
 * stays set after the blur, until the field is edited again or the number is
 * changed from outside (a preset, a shared link).
 */
export function useNumericInput(value: number, setValue: (n: number) => void, limits: NumericLimits) {
    const [text, setText] = useState<string>(() => String(value));
    const [focused, setFocused] = useState(false);
    const [limitHit, setLimitHit] = useState<LimitHit | null>(null);
    // "Adjust state during render", not an effect: when the committed number
    // changes underneath an unfocused field (presets, shared links), the text
    // resyncs before paint instead of one frame later.
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) {
        setLastValue(value);
        if (!focused) {
            setText(String(value));
            setLimitHit(null);
        }
    }

    // What was typed into the server's HTML before this code loaded (see
    // readTypedBeforeLoad). Read once, when the field is first in the page. A
    // layout effect, so the typed number is in use before the next paint: an
    // update made from a passive effect after hydration is given React's
    // lowest priority and waits behind any Server Action in flight.
    const inputRef = useRef<HTMLInputElement>(null);
    const readFieldRef = useRef(false);
    useLayoutEffect(() => {
        if (readFieldRef.current) return;
        readFieldRef.current = true;
        const field = inputRef.current;
        if (!field) return;
        const isFocused = document.activeElement === field;
        const typed = readTypedBeforeLoad(field.value, text, isFocused, limits);
        if (typed === null) return;
        if (typed.kind === 'restore') {
            field.value = text;
            return;
        }
        setFocused(isFocused);
        setText(typed.text);
        setLimitHit(typed.hit);
        if (typed.value !== null) setValue(typed.value);
    }, [text, limits, setValue]);

    return {
        inputProps: {
            ref: inputRef,
            value: text,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const raw = e.target.value;
                // A field focused before this code loaded never reported the
                // focus, and an unfocused field has its text rewritten from
                // the number on every change.
                if (document.activeElement === e.target) setFocused(true);
                setText(raw);
                const reading = readNumericText(raw, limits);
                setLimitHit(reading.hit);
                if (reading.value !== null) setValue(reading.value);
            },
            onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
                setFocused(true);
                e.target.select();
            },
            onBlur: () => {
                setFocused(false);
                setText(String(value));
            },
        },
        limitHit,
    };
}
