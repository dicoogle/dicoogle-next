/**
 * Date Filter Plugin - Query Filter Type
 * Adds date range filter to search
 */

import { WebUIPlugin, QueryFilterExtension, PluginContext } from '@/plugins';
import { lazy } from 'react';

const DateRangeFilter = lazy(() => import('./DateRangeFilter'));

const dateFilterPlugin: WebUIPlugin = {
  metadata: {
    id: 'date-filter',
    name: 'Date Range Filter',
    version: '1.0.0',
    description: 'Filter search results by study date range',
    author: 'Dicoogle Team',
    type: 'query-filter',
  },

  init: async (context: PluginContext) => {
    context.logger.info('Date Filter Plugin initialized');

    // Set default date range (last 30 days)
    const defaultRange = {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      to: new Date().toISOString().split('T')[0],
    };

    context.storage.set('default-date-range', defaultRange);
  },

  getQueryFilterExtensions: (): QueryFilterExtension[] => [
    {
      id: 'study-date-range',
      label: 'Study Date',
      component: DateRangeFilter,
      defaultValue: {
        from: null,
        to: null,
        enabled: false,
      },
      order: 10,
    },
  ],
};

export default dateFilterPlugin;
