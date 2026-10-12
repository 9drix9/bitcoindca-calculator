import { describe, it, expect } from 'vitest';
import { keyboardLooksOpen } from './useKeyboardOpen';

/**
 * The tab bar unmounts while this returns true, and the tab bar is the only way
 * into the menu on a phone. So the cases that matter most are the ones where a
 * height difference is NOT a keyboard.
 */
describe('keyboardLooksOpen', () => {
    const phone = { innerWidth: 390, innerHeight: 844 };

    it('is false on a phone at rest', () => {
        expect(keyboardLooksOpen({ ...phone, viewport: { width: 390, height: 844, scale: 1 } })).toBe(false);
    });

    it('is true when a keyboard covers the visual viewport and the layout viewport stays put', () => {
        // iOS Safari, and Android browsers that do not honour resizes-content.
        expect(keyboardLooksOpen({ ...phone, viewport: { width: 390, height: 508, scale: 1 } })).toBe(true);
    });

    it('is false when the keyboard resized the layout viewport instead', () => {
        // resizes-content: both shrink together, and the bar sits on top of the keyboard.
        expect(keyboardLooksOpen({ innerWidth: 390, innerHeight: 508, viewport: { width: 390, height: 508, scale: 1 } })).toBe(false);
    });

    it('is false for the iOS toolbar expanding, which is well under the threshold', () => {
        expect(keyboardLooksOpen({ ...phone, viewport: { width: 390, height: 770, scale: 1 } })).toBe(false);
    });

    it('is false under pinch-zoom', () => {
        expect(keyboardLooksOpen({ ...phone, viewport: { width: 320, height: 692, scale: 1.22 } })).toBe(false);
    });

    it('is false on a page wider than the screen, where the layout viewport is stretched to fit it', () => {
        // Measured in Chrome's phone emulation on two pages whose comparison
        // tables let a label escape sideways. Before the width was taken into
        // account each of these read as a keyboard (503px and 205px) and the
        // tab bar was gone from the page.
        expect(keyboardLooksOpen({ innerWidth: 623, innerHeight: 1347, viewport: { width: 390, height: 844, scale: 1 } })).toBe(false);
        expect(keyboardLooksOpen({ innerWidth: 435, innerHeight: 773, viewport: { width: 320, height: 568, scale: 1 } })).toBe(false);
    });

    it('still sees a keyboard on a page wider than the screen', () => {
        // Same stretched page, with 336px of the screen now under a keyboard.
        expect(keyboardLooksOpen({ innerWidth: 623, innerHeight: 1347, viewport: { width: 390, height: 508, scale: 1 } })).toBe(true);
    });

    it('is not fooled by a desktop scrollbar, which narrows the visual viewport by a few pixels', () => {
        expect(keyboardLooksOpen({ innerWidth: 700, innerHeight: 800, viewport: { width: 685, height: 800, scale: 1 } })).toBe(false);
    });

    it('is false without the Visual Viewport API', () => {
        expect(keyboardLooksOpen({ ...phone, viewport: null })).toBe(false);
        expect(keyboardLooksOpen({ ...phone, viewport: undefined })).toBe(false);
    });
});
