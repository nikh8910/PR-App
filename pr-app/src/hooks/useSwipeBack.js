import { useEffect, useState } from 'react';

/**
 * Custom hook to detect a right-swipe gesture (from left edge towards right)
 * typical of iOS "go back" behavior.
 * 
 * @param {Function} onSwipeRightCallback - Function called when swipe is detected
 * @param {number} threshold - Minimum pixels swiped before triggering (default 100)
 */
export function useSwipeBack(onSwipeRightCallback, threshold = 100) {
    const [touchStartX, setTouchStartX] = useState(0);
    const [touchEndX, setTouchEndX] = useState(0);
    const [touchStartY, setTouchStartY] = useState(0);
    const [touchEndY, setTouchEndY] = useState(0);

    useEffect(() => {
        const handleTouchStart = (e) => {
            setTouchStartX(e.targetTouches[0].clientX);
            setTouchStartY(e.targetTouches[0].clientY);
        };

        const handleTouchMove = (e) => {
            setTouchEndX(e.targetTouches[0].clientX);
            setTouchEndY(e.targetTouches[0].clientY);
        };

        const handleTouchEnd = () => {
            // Check if there was significant horizontal swipe
            if (!touchStartX || !touchEndX) return;

            const distanceX = touchEndX - touchStartX;
            const distanceY = Math.abs(touchEndY - touchStartY);

            // Requirements for "Back" Swipe:
            // 1. Swiped to the right (distanceX > threshold)
            // 2. Swiped mostly horizontal rather than scrolling up/down (distanceY < 50)
            // 3. Started close to the left edge (e.g. within 50px) to mimic iOS native behavior

            if (distanceX > threshold && distanceY < 50 && touchStartX < 50) {
                if (onSwipeRightCallback) {
                    onSwipeRightCallback();
                }
            }

            // reset
            setTouchStartX(0);
            setTouchEndX(0);
            setTouchStartY(0);
            setTouchEndY(0);
        };

        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('touchend', handleTouchEnd);

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [touchStartX, touchEndX, touchStartY, touchEndY, onSwipeRightCallback, threshold]);
}
