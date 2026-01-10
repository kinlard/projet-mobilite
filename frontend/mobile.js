/**
 * ============================================================
 * MOBILE.JS - Gestion Responsive & Touch Optimization
 * Standard: Zero Bug, Zero Regression, 60fps performance
 * ============================================================
 */

(function() {
    'use strict';
    
    // ============================================================
    // DETECTION MOBILE & STATE MANAGEMENT
    // ============================================================
    
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const isTablet = () => window.matchMedia('(min-width: 769px) and (max-width: 1024px)').matches;
    
    let mobileState = {
        isMobile: isMobile(),
        isTablet: isTablet(),
        menuOpen: false,
        lastResize: Date.now()
    };
    
    // ============================================================
    // LEAFLET MAP INVALIDATION (CRITICAL)
    // ============================================================
    
    /**
     * Force Leaflet à recalculer les dimensions de la carte
     * Nécessaire lors des rotations Portrait/Paysage
     */
    function invalidateMapSize() {
        if (typeof map !== 'undefined' && map && map.invalidateSize) {
            // Delay pour laisser le DOM se stabiliser après resize
            setTimeout(() => {
                map.invalidateSize({
                    pan: false,
                    animate: false
                });
                console.log('📱 Map invalidated for mobile');
            }, 100);
        }
    }
    
    /**
     * Debounce pour éviter les appels excessifs lors du resize
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // ============================================================
    // WINDOW RESIZE HANDLER
    // ============================================================
    
    const handleResize = debounce(function() {
        const now = Date.now();
        
        // Éviter les appels trop rapprochés
        if (now - mobileState.lastResize < 300) return;
        mobileState.lastResize = now;
        
        const wasMobile = mobileState.isMobile;
        mobileState.isMobile = isMobile();
        mobileState.isTablet = isTablet();
        
        // Invalider la carte si changement de mode ou rotation
        if (wasMobile !== mobileState.isMobile || mobileState.isMobile) {
            invalidateMapSize();
        }
        
        // Mettre à jour la classe body
        updateBodyClasses();
        
        console.log('📱 Resize detected:', {
            isMobile: mobileState.isMobile,
            isTablet: mobileState.isTablet,
            width: window.innerWidth,
            height: window.innerHeight
        });
    }, 250);
    
    // ============================================================
    // ORIENTATION CHANGE HANDLER
    // ============================================================
    
    function handleOrientationChange() {
        console.log('📱 Orientation changed to:', screen.orientation?.type || 'unknown');
        
        // Force l'invalidation avec un délai plus long pour stabilité
        setTimeout(() => {
            invalidateMapSize();
        }, 300);
    }
    
    // ============================================================
    // BODY CLASSES UPDATE
    // ============================================================
    
    function updateBodyClasses() {
        if (mobileState.isMobile) {
            document.body.classList.add('is-mobile');
            document.body.classList.remove('is-tablet', 'is-desktop');
        } else if (mobileState.isTablet) {
            document.body.classList.add('is-tablet');
            document.body.classList.remove('is-mobile', 'is-desktop');
        } else {
            document.body.classList.add('is-desktop');
            document.body.classList.remove('is-mobile', 'is-tablet');
        }
    }
    
    // ============================================================
    // BURGER MENU TOGGLE (MOBILE NAVIGATION)
    // ============================================================
    
    function initBurgerMenu() {
        const burgerBtn = document.getElementById('burgerMenu');
        const navLinks = document.getElementById('navLinks');
        
        if (!burgerBtn || !navLinks) return;
        
        burgerBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            mobileState.menuOpen = !mobileState.menuOpen;
            
            // Toggle classes
            burgerBtn.classList.toggle('open', mobileState.menuOpen);
            navLinks.classList.toggle('open', mobileState.menuOpen);
            document.body.classList.toggle('mobile-menu-open', mobileState.menuOpen);
            
            console.log('📱 Menu toggled:', mobileState.menuOpen);
        });
        
        // Fermer le menu en cliquant sur un lien
        const links = navLinks.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                if (mobileState.isMobile) {
                    closeMobileMenu();
                }
            });
        });
        
        // Fermer le menu en cliquant ailleurs
        document.addEventListener('click', function(e) {
            if (mobileState.menuOpen && 
                !burgerBtn.contains(e.target) && 
                !navLinks.contains(e.target)) {
                closeMobileMenu();
            }
        });
    }
    
    function closeMobileMenu() {
        const burgerBtn = document.getElementById('burgerMenu');
        const navLinks = document.getElementById('navLinks');
        
        if (burgerBtn && navLinks) {
            mobileState.menuOpen = false;
            burgerBtn.classList.remove('open');
            navLinks.classList.remove('open');
            document.body.classList.remove('mobile-menu-open');
        }
    }
    
    // ============================================================
    // TOUCH OPTIMIZATIONS
    // ============================================================
    
    /**
     * Optimise les événements touch pour éviter les delays
     */
    function initTouchOptimizations() {
        // Supprimer le delay 300ms sur tous les boutons et liens
        const touchElements = document.querySelectorAll('button, a, .btn-tool, .cta-btn');
        
        touchElements.forEach(element => {
            element.style.touchAction = 'manipulation';
        });
        
        console.log('📱 Touch optimizations applied to', touchElements.length, 'elements');
    }
    
    /**
     * Prevent double-tap zoom on specific elements
     */
    function preventDoubleTapZoom() {
        let lastTouchEnd = 0;
        
        document.addEventListener('touchend', function(e) {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
    }
    
    // ============================================================
    // LEAFLET MOBILE FIXES
    // ============================================================
    
    /**
     * Applique des corrections spécifiques Leaflet pour mobile
     */
    function applyLeafletMobileFixes() {
        // Attendre que Leaflet soit chargé
        const checkLeaflet = setInterval(() => {
            if (typeof L !== 'undefined' && typeof map !== 'undefined' && map) {
                clearInterval(checkLeaflet);
                
                console.log('📱 Applying Leaflet mobile fixes...');
                
                // Désactiver tap pour éviter conflits avec touch
                if (map.tap) {
                    map.tap.disable();
                }
                
                // Optimiser les options pour mobile
                if (mobileState.isMobile) {
                    map.options.zoomSnap = 0.5;
                    map.options.zoomDelta = 0.5;
                    map.options.wheelPxPerZoomLevel = 120;
                    
                    // Activer l'inertie pour un défilement fluide
                    map.options.inertia = true;
                    map.options.inertiaDeceleration = 3000;
                    map.options.inertiaMaxSpeed = 1500;
                }
                
                // Invalider au chargement
                invalidateMapSize();
                
                console.log('✅ Leaflet mobile fixes applied');
            }
        }, 100);
        
        // Timeout de sécurité
        setTimeout(() => clearInterval(checkLeaflet), 5000);
    }
    
    // ============================================================
    // SCROLL LOCK (Pour modales mobiles)
    // ============================================================
    
    function enableScrollLock() {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
    }
    
    function disableScrollLock() {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
    }
    
    // Exposer les fonctions pour utilisation externe
    window.mobileUtils = {
        enableScrollLock,
        disableScrollLock,
        invalidateMapSize,
        isMobile: () => mobileState.isMobile,
        isTablet: () => mobileState.isTablet
    };
    
    // ============================================================
    // PERFORMANCE MONITORING (DEV ONLY)
    // ============================================================
    
    function monitorPerformance() {
        if (window.location.hostname === 'localhost') {
            let frameCount = 0;
            let lastTime = performance.now();
            
            function countFrame() {
                frameCount++;
                const currentTime = performance.now();
                
                if (currentTime >= lastTime + 1000) {
                    const fps = Math.round(frameCount * 1000 / (currentTime - lastTime));
                    
                    if (fps < 55) {
                        console.warn('⚠️ Low FPS detected:', fps);
                    }
                    
                    frameCount = 0;
                    lastTime = currentTime;
                }
                
                requestAnimationFrame(countFrame);
            }
            
            requestAnimationFrame(countFrame);
        }
    }
    
    // ============================================================
    // INITIALIZATION
    // ============================================================
    
    function init() {
        console.log('📱 Mobile.js initializing...');
        
        // Mise à jour initiale
        updateBodyClasses();
        
        // Event Listeners
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);
        
        // Écouter les événements screen.orientation si disponible
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleOrientationChange);
        }
        
        // Init burger menu
        initBurgerMenu();
        
        // Touch optimizations
        initTouchOptimizations();
        
        // Prevent double-tap zoom
        if (mobileState.isMobile) {
            preventDoubleTapZoom();
        }
        
        // Leaflet fixes
        applyLeafletMobileFixes();
        
        // Performance monitoring (dev only)
        monitorPerformance();
        
        console.log('✅ Mobile.js initialized', {
            isMobile: mobileState.isMobile,
            isTablet: mobileState.isTablet,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        });
    }
    
    // ============================================================
    // AUTO-INIT
    // ============================================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Hook pour invalidation manuelle de la carte
    window.addEventListener('load', () => {
        setTimeout(invalidateMapSize, 500);
    });
    
})();
