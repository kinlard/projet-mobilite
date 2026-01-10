/**
 * ============================================================
 * MOBILE-LOGIC.JS - Gestion Adaptive UI Mobile PWA
 * Architecture: Vues Plein Écran + Header 2 Étages
 * ============================================================ */

(function() {
    'use strict';
    
    /* ============================================================
       DÉTECTION & STATE
       ============================================================ */
    
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const isTablet = () => window.matchMedia('(min-width: 769px) and (max-width: 1024px)').matches;
    
    let mobileState = {
        isMobile: isMobile(),
        isTablet: isTablet(),
        currentView: null, // 'discover', 'stats', null
        lastResize: Date.now()
    };
    
    /* ============================================================
       INVALIDATION CARTE LEAFLET (CRITIQUE)
       ============================================================ */
    
    function invalidateMapSize() {
        if (typeof map !== 'undefined' && map && map.invalidateSize) {
            setTimeout(() => {
                map.invalidateSize({
                    pan: false,
                    animate: false
                });
                console.log('📱 Carte invalidée pour mobile');
            }, 100);
        }
    }
    
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
    
    /* ============================================================
       GESTION VUES PLEIN ÉCRAN MOBILE
       ============================================================ */
    
    /**
     * Ouvre une vue plein écran (Stats ou Découvrir)
     * @param {string} viewType - 'stats' ou 'discover'
     */
    function openMobileFullView(viewType) {
        if (!mobileState.isMobile) return;
        
        mobileState.currentView = viewType;
        document.body.style.overflow = 'hidden';
        
        // Invalider la carte après fermeture
        setTimeout(invalidateMapSize, 350);
        
        console.log('📱 Vue plein écran ouverte:', viewType);
    }
    
    /**
     * Ferme la vue plein écran active
     */
    function closeMobileFullView() {
        if (!mobileState.isMobile) return;
        
        mobileState.currentView = null;
        document.body.style.overflow = '';
        
        // Invalider la carte après fermeture
        setTimeout(invalidateMapSize, 350);
        
        console.log('📱 Vue plein écran fermée');
    }
    
    /**
     * Hook sur le bouton Stats pour mode mobile
     */
    function hookStatsButton() {
        const btnStats = document.getElementById('btnStats');
        if (!btnStats) return;
        
        const originalOnClick = btnStats.onclick;
        
        btnStats.onclick = function(e) {
            if (mobileState.isMobile) {
                e.preventDefault();
                openStatsFullView();
            } else if (originalOnClick) {
                originalOnClick.call(this, e);
            }
        };
    }
    
    /**
     * Ouvre le panneau Stats en mode plein écran mobile
     */
    function openStatsFullView() {
        const statsPanel = document.getElementById('statsPanel');
        if (!statsPanel) return;
        
        statsPanel.classList.add('active');
        openMobileFullView('stats');
        
        // Créer/mettre à jour le bouton fermer
        let closeBtn = statsPanel.querySelector('.close-btn');
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.className = 'close-btn';
            closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            
            const header = statsPanel.querySelector('.stats-header');
            if (header) {
                header.appendChild(closeBtn);
            }
        }
        
        closeBtn.onclick = function() {
            statsPanel.classList.remove('active');
            closeMobileFullView();
        };
    }
    
    /**
     * Hook sur openDiscoverModal pour mode mobile
     */
    function hookDiscoverModal() {
        // Intercepter l'ouverture
        const originalOpenDiscover = window.openDiscoverModal;
        
        window.openDiscoverModal = function() {
            if (mobileState.isMobile) {
                openDiscoverFullView();
            } else if (originalOpenDiscover) {
                originalOpenDiscover();
            }
        };
        
        // Intercepter la fermeture
        const originalCloseDiscover = window.closeDiscover;
        
        window.closeDiscover = function() {
            if (mobileState.isMobile) {
                closeDiscoverFullView();
            } else if (originalCloseDiscover) {
                originalCloseDiscover();
            }
        };
    }
    
    /**
     * Ouvre la modale Découvrir en plein écran mobile
     */
    function openDiscoverFullView() {
        const modal = document.getElementById('discoverModal');
        if (!modal) return;
        
        modal.classList.add('active');
        openMobileFullView('discover');
    }
    
    /**
     * Ferme la modale Découvrir
     */
    function closeDiscoverFullView() {
        const modal = document.getElementById('discoverModal');
        if (!modal) return;
        
        modal.classList.remove('active');
        closeMobileFullView();
    }
    
    /* ============================================================
       SYNCHRONISATION RECHERCHE MOBILE <-> DESKTOP
       ============================================================ */
    
    function syncSearchInputs() {
        const desktopInput = document.getElementById('search-input');
        const mobileInput = document.getElementById('mobile-search-input');
        const desktopDatalist = document.getElementById('gares-list');
        const mobileDatalist = document.getElementById('mobile-gares-list');
        
        if (!desktopInput || !mobileInput) return;
        
        // Sync mobile -> desktop
        mobileInput.addEventListener('input', function() {
            desktopInput.value = this.value;
        });
        
        // Sync desktop -> mobile
        desktopInput.addEventListener('input', function() {
            mobileInput.value = this.value;
        });
        
        // Sync datalist
        if (desktopDatalist && mobileDatalist) {
            const observer = new MutationObserver(() => {
                mobileDatalist.innerHTML = desktopDatalist.innerHTML;
            });
            
            observer.observe(desktopDatalist, {
                childList: true,
                subtree: true
            });
        }
        
        // Trigger sur selection mobile
        mobileInput.addEventListener('change', function() {
            // Déclencher l'événement de sélection sur l'input desktop
            const event = new Event('change', { bubbles: true });
            desktopInput.dispatchEvent(event);
            
            // Si une fonction de recherche existe, l'appeler
            if (typeof window.handleSearchSelection === 'function') {
                window.handleSearchSelection(this.value);
            }
        });
    }
    
    /* ============================================================
       WINDOW RESIZE HANDLER
       ============================================================ */
    
    const handleResize = debounce(function() {
        const now = Date.now();
        
        if (now - mobileState.lastResize < 300) return;
        mobileState.lastResize = now;
        
        const wasMobile = mobileState.isMobile;
        mobileState.isMobile = isMobile();
        mobileState.isTablet = isTablet();
        
        // Invalider la carte si changement de mode
        if (wasMobile !== mobileState.isMobile || mobileState.isMobile) {
            invalidateMapSize();
        }
        
        // Mettre à jour les classes body
        updateBodyClasses();
        
        // Fermer les vues mobiles si passage en desktop
        if (!mobileState.isMobile && mobileState.currentView) {
            const statsPanel = document.getElementById('statsPanel');
            const discoverModal = document.getElementById('discoverModal');
            
            if (statsPanel) statsPanel.classList.remove('active');
            if (discoverModal) discoverModal.classList.remove('active');
            
            mobileState.currentView = null;
            document.body.style.overflow = '';
        }
        
        console.log('📱 Resize détecté:', {
            isMobile: mobileState.isMobile,
            isTablet: mobileState.isTablet,
            width: window.innerWidth
        });
    }, 250);
    
    /* ============================================================
       ORIENTATION CHANGE
       ============================================================ */
    
    function handleOrientationChange() {
        console.log('📱 Orientation changée:', screen.orientation?.type || 'unknown');
        
        setTimeout(() => {
            invalidateMapSize();
        }, 300);
    }
    
    /* ============================================================
       BODY CLASSES UPDATE
       ============================================================ */
    
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
    
    /* ============================================================
       TOUCH OPTIMIZATIONS
       ============================================================ */
    
    function initTouchOptimizations() {
        const touchElements = document.querySelectorAll('button, a, .mobile-tool-btn');
        
        touchElements.forEach(element => {
            element.style.touchAction = 'manipulation';
        });
        
        console.log('📱 Optimisations touch appliquées à', touchElements.length, 'éléments');
    }
    
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
    
    /* ============================================================
       LEAFLET MOBILE FIXES
       ============================================================ */
    
    function applyLeafletMobileFixes() {
        const checkLeaflet = setInterval(() => {
            if (typeof L !== 'undefined' && typeof map !== 'undefined' && map) {
                clearInterval(checkLeaflet);
                
                console.log('📱 Application des fixes Leaflet mobile...');
                
                // Désactiver tap pour éviter conflits
                if (map.tap) {
                    map.tap.disable();
                }
                
                // Optimiser pour mobile
                if (mobileState.isMobile) {
                    map.options.zoomSnap = 0.5;
                    map.options.zoomDelta = 0.5;
                    map.options.wheelPxPerZoomLevel = 120;
                    map.options.inertia = true;
                    map.options.inertiaDeceleration = 3000;
                    map.options.inertiaMaxSpeed = 1500;
                }
                
                invalidateMapSize();
                
                console.log('✅ Fixes Leaflet mobile appliqués');
            }
        }, 100);
        
        setTimeout(() => clearInterval(checkLeaflet), 5000);
    }
    
    /* ============================================================
       GESTION LANGUE MOBILE
       ============================================================ */
    
    function updateMobileLangText() {
        const langText = document.getElementById('mobile-lang-text');
        if (!langText) return;
        
        // Écouter les changements de langue
        const originalSwitchLang = window.switchLangMap;
        
        window.switchLangMap = function() {
            if (originalSwitchLang) {
                originalSwitchLang();
            }
            
            // Mettre à jour le texte mobile
            setTimeout(() => {
                const currentLang = window.isFrMap ? 'FR' : 'EN';
                langText.textContent = currentLang;
            }, 100);
        };
    }
    
    /* ============================================================
       PERFORMANCE MONITORING (DEV)
       ============================================================ */
    
    function monitorPerformance() {
        if (window.location.hostname !== 'localhost') return;
        
        let frameCount = 0;
        let lastTime = performance.now();
        
        function countFrame() {
            frameCount++;
            const currentTime = performance.now();
            
            if (currentTime >= lastTime + 1000) {
                const fps = Math.round(frameCount * 1000 / (currentTime - lastTime));
                
                if (fps < 55) {
                    console.warn('⚠️ FPS bas détecté:', fps);
                }
                
                frameCount = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(countFrame);
        }
        
        requestAnimationFrame(countFrame);
    }
    
    /* ============================================================
       EXPOSITION API PUBLIQUE
       ============================================================ */
    
    window.mobileUtils = {
        invalidateMapSize,
        isMobile: () => mobileState.isMobile,
        isTablet: () => mobileState.isTablet,
        openMobileFullView,
        closeMobileFullView
    };
    
    /* ============================================================
       INITIALIZATION
       ============================================================ */
    
    function init() {
        console.log('📱 Mobile-Logic.js initialisation...');
        
        updateBodyClasses();
        
        // Event Listeners
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);
        
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleOrientationChange);
        }
        
        // Hooks des modales/panneaux
        hookStatsButton();
        hookDiscoverModal();
        
        // Synchronisation recherche
        syncSearchInputs();
        
        // Touch optimizations
        initTouchOptimizations();
        
        if (mobileState.isMobile) {
            preventDoubleTapZoom();
        }
        
        // Leaflet fixes
        applyLeafletMobileFixes();
        
        // Langue mobile
        updateMobileLangText();
        
        // Performance monitoring
        monitorPerformance();
        
        console.log('✅ Mobile-Logic.js initialisé', {
            isMobile: mobileState.isMobile,
            isTablet: mobileState.isTablet,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        });
    }
    
    /* ============================================================
       AUTO-INIT
       ============================================================ */
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    window.addEventListener('load', () => {
        setTimeout(invalidateMapSize, 500);
    });
    
})();
