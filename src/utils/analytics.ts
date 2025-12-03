import { AnalyticsConfig } from '../core/types.js';

/**
 * Analytics Manager - Handles integration with Google Analytics (GA4)
 */
export class AnalyticsManager {
    private config: AnalyticsConfig;
    private initialized: boolean = false;

    constructor(config: AnalyticsConfig) {
        this.config = config;
        this.initialize();
    }

    /**
     * Initialize Google Analytics
     */
    private initialize() {
        if (!this.config.enabled || !this.config.googleAnalyticsId) return;

        if (typeof window === 'undefined') return;

        // Check if GA is already initialized
        if ((window as any).gtag) {
            this.initialized = true;
            return;
        }

        // Inject GA script
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.googleAnalyticsId}`;
        document.head.appendChild(script);

        // Initialize dataLayer
        (window as any).dataLayer = (window as any).dataLayer || [];
        function gtag(...args: any[]) {
            (window as any).dataLayer.push(args);
        }
        (window as any).gtag = gtag;

        gtag('js', new Date());
        gtag('config', this.config.googleAnalyticsId, {
            send_page_view: this.config.autoTrackPageView !== false,
            ...this.config.customDimensions
        });

        this.initialized = true;

        if (this.config.debug) {
            console.log(`[Analytics] Initialized GA4 with ID: ${this.config.googleAnalyticsId}`);
        }
    }

    /**
     * Track a custom event
     */
    trackEvent(eventName: string, params?: Record<string, any>) {
        if (!this.initialized) return;

        // Security Hook: Allow user to sanitize or drop event
        let finalParams = params || {};
        if (this.config.beforeSend) {
            const result = this.config.beforeSend(eventName, finalParams);
            if (result === null) {
                if (this.config.debug) {
                    console.log(`[Analytics] Event dropped by beforeSend hook: ${eventName}`);
                }
                return; // Drop event
            }
            finalParams = result;
        }

        if (this.config.debug) {
            console.log(`[Analytics] Track Event: ${eventName}`, finalParams);
        }

        if (typeof (window as any).gtag === 'function') {
            (window as any).gtag('event', eventName, finalParams);
        }
    }

    /**
     * Track an API error
     */
    trackError(error: any, context?: string) {
        if (!this.config.autoTrackErrors) return;

        this.trackEvent('api_error', {
            event_category: 'Error',
            event_label: context || 'API Error',
            message: error.message || 'Unknown error',
            code: error.code,
            status: error.status
        });
    }

    /**
     * Track performance metrics
     */
    trackPerformance(metrics: any) {
        if (!this.config.autoTrackPerformance) return;

        this.trackEvent('performance_metrics', {
            event_category: 'Performance',
            average_latency: metrics.averageLatency,
            error_rate: metrics.errorRate,
            cache_hit_rate: metrics.cacheHitRate,
            slowest_request_route: metrics.slowestRequests?.[0]?.route,
            slowest_request_duration: metrics.slowestRequests?.[0]?.duration
        });
    }

    /**
     * Manually track page view (for SPA navigation)
     */
    trackPageView(path: string) {
        if (!this.initialized) return;

        if (this.config.debug) {
            console.log(`[Analytics] Track Page View: ${path}`);
        }

        if (typeof (window as any).gtag === 'function') {
            (window as any).gtag('config', this.config.googleAnalyticsId, {
                page_path: path
            });
        }
    }
}
