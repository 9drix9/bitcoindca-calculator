'use client';

interface AdSlotProps {
    unitId?: string;
    className?: string;
}

// A fixed, honest 90px reservation: no layout shift when the ad loads and no
// giant blank band when it doesn't.
export const AdSlot = ({ unitId = '2426249', className = '' }: AdSlotProps) => {
    return (
        // Two elements: callers pass layout classes (e.g. `flex justify-center`)
        // on the outer node, so the label and the iframe live in an inner block
        // wrapper — otherwise they become flex siblings and render side by side.
        <div className={`w-full ${className}`}>
            <div className="block w-full">
                <span className="block text-center text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-600 mb-1" aria-hidden="true">
                    Sponsored
                </span>
                <iframe
                    data-aa={unitId}
                    src={`//acceptable.a-ads.com/${unitId}/?size=Adaptive`}
                    title="Advertisement"
                    loading="lazy"
                    style={{
                        border: 0,
                        padding: 0,
                        width: '100%',
                        maxWidth: 728,
                        height: 90,
                        overflow: 'hidden',
                        display: 'block',
                        margin: '0 auto',
                    }}
                />
            </div>
        </div>
    );
};
