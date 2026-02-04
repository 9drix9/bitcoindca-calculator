'use client';

import { ReactNode } from 'react';
import { CurrencyProvider } from '@/context/CurrencyContext';

export const Providers = ({ children }: { children: ReactNode }) => {
    return (
        <CurrencyProvider>
            {children}
        </CurrencyProvider>
    );
};
