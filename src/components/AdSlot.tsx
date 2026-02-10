'use client';

interface AdSlotProps {
    unitId?: string;
    className?: string;
}

export const AdSlot = ({ unitId = '2426249', className = '' }: AdSlotProps) => {
    return (
        <div className={`w-full relative ${className}`} style={{ zIndex: 99998 }}>
            <iframe
                data-aa={unitId}
                src={`//acceptable.a-ads.com/${unitId}/?size=Adaptive`}
                style={{
                    border: 0,
                    padding: 0,
                    width: '70%',
                    height: 'auto',
                    overflow: 'hidden',
                    display: 'block',
                    margin: 'auto',
                }}
            />
        </div>
    );
};
