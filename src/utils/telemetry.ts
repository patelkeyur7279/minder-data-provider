import { TelemetryConfig } from '../core/types.js';

/**
 * Telemetry Manager - Collects and sends anonymous usage stats to MinderTech
 * Used for framework improvement and stability monitoring.
 */
export class TelemetryManager {
    private config: TelemetryConfig;
    private queue: any[] = [];
    private flushInterval: NodeJS.Timeout | null = null;

    private readonly DEFAULT_ENDPOINT = 'https://telemetry.minder.tech/v1/collect';
    private readonly VERSION = '2.1.2-beta.8'; // Should be injected from package.json in real build

    constructor(config: TelemetryConfig) {
        this.config = config;

        // Respect sampling rate (default 10%)
        const sampleRate = config.sampleRate ?? 0.1;
        if (Math.random() > sampleRate) {
            this.config.enabled = false;
        }

        if (this.config.enabled) {
            this.startFlushTimer();
            this.trackSessionStart();
        }
    }

    private startFlushTimer() {
        this.flushInterval = setInterval(() => this.flush(), 60000); // Flush every minute
    }

    private async flush() {
        if (this.queue.length === 0) return;

        // GA4 Mode
        if (this.config.mode === 'ga4' && this.config.measurementId) {
            await this.flushToGA4();
            return;
        }

        // Custom Mode (Default)
        const payload = {
            timestamp: new Date().toISOString(),
            framework_version: this.VERSION,
            platform: typeof window !== 'undefined' ? 'web' : 'node',
            events: [...this.queue]
        };

        // Clear queue immediately
        this.queue = [];

        try {
            const endpoint = this.config.endpoint || this.DEFAULT_ENDPOINT;

            if (this.config.debug) {
                console.log('[Minder Telemetry] Sending to Custom Endpoint:', payload);
                return;
            }

            if (typeof fetch !== 'undefined') {
                await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true
                });
            }
        } catch (e) {
            // Silently fail
        }
    }

    private async flushToGA4() {
        const events = [...this.queue];
        this.queue = [];

        // Transform events to GA4 format
        // https://developers.google.com/analytics/devguides/collection/protocol/ga4
        const ga4Events = events.map(e => {
            if (e.type === 'error') {
                return {
                    name: 'framework_error',
                    params: {
                        framework_version: this.VERSION,
                        error_name: e.name,
                        error_message: e.message,
                        error_context: e.context
                    }
                };
            }
            if (e.type === 'performance') {
                return {
                    name: 'framework_performance',
                    params: {
                        framework_version: this.VERSION,
                        avg_latency: e.avg_latency,
                        error_rate: e.error_rate,
                        cache_hit_rate: e.cache_hit_rate
                    }
                };
            }
            return {
                name: 'framework_event',
                params: { ...e, framework_version: this.VERSION }
            };
        });

        const payload = {
            client_id: this.getClientId(),
            events: ga4Events
        };

        try {
            const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret || ''}`;

            if (this.config.debug) {
                console.log('[Minder Telemetry] Sending to GA4:', payload);
                return;
            }

            if (typeof fetch !== 'undefined') {
                await fetch(endpoint, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    keepalive: true
                });
            }
        } catch (e) {
            // Silently fail
        }
    }

    private getClientId(): string {
        // Simple random ID for anonymous telemetry
        // In a real app, you might persist this in localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
            let cid = window.localStorage.getItem('minder_telemetry_cid');
            if (!cid) {
                cid = Math.random().toString(36).substring(2) + Date.now().toString(36);
                window.localStorage.setItem('minder_telemetry_cid', cid);
            }
            return cid;
        }
        return 'node-' + Math.random().toString(36).substring(2);
    }

    private trackSessionStart() {
        this.queue.push({
            type: 'session_start',
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
            url: typeof window !== 'undefined' ? window.location.href : undefined
        });
    }

    /**
     * Track a framework error (anonymized)
     */
    trackError(error: any, context: string) {
        if (!this.config.enabled) return;

        this.queue.push({
            type: 'error',
            context,
            name: error.name,
            message: error.message, // Be careful with PII here in real world
            code: error.code,
            status: error.status
        });
    }

    /**
     * Track performance summary
     */
    trackPerformance(metrics: any) {
        if (!this.config.enabled) return;

        this.queue.push({
            type: 'performance',
            avg_latency: metrics.averageLatency,
            error_rate: metrics.errorRate,
            cache_hit_rate: metrics.cacheHitRate
        });
    }
}
