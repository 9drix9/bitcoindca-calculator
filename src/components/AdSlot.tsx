'use client';

interface AdSlotProps {
    unitId?: string;
    className?: string;
}

export const AdSlot = ({ unitId = '2426249', className = '' }: AdSlotProps) => (
    <div className={`w-full relative ${className}`}>
        <iframe
            data-aa={unitId}
            src={`//acceptable.a-ads.com/${unitId}/?size=Adaptive`}
            title="Advertisement"
            loading="lazy"
            suppressHydrationWarning
            style={{
                border: 0,
                padding: 0,
                width: '100%',
                height: 'auto',
                overflow: 'hidden',
                display: 'block',
                margin: '0 auto',
            }}
        />
    </div>
);
