import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ApiRoute, ApiError } from './types.js';
import { ApiClient } from './ApiClient.js';

interface SliceState<T = any> {
  items: T[];
  currentItem: T | null;
  loading: {
    fetch: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  errors: {
    fetch: ApiError | null;
    create: ApiError | null;
    update: ApiError | null;
    delete: ApiError | null;
  };
  meta: {
    total: number;
    page: number;
    hasMore: boolean;
  };
}

export function createApiSlices(routes: Record<string, ApiRoute>, apiClient: ApiClient) {
  const slices: Record<string, any> = {};
  const reducers: Record<string, any> = {};

  Object.entries(routes).forEach(([routeName, route]) => {
    // Create async thunks for each route
    const fetchThunk = createAsyncThunk<any, any>(
      `${routeName}/fetch`,
      async (params?: any) => {
        return await apiClient.request(routeName, undefined, params);
      }
    );

    const createThunk = createAsyncThunk<any, any>(
      `${routeName}/create`,
      async (data: any) => {
        return await apiClient.request(routeName, data);
      }
    );

    const updateThunk = createAsyncThunk<any, { id: string | number; data: any }>(
      `${routeName}/update`,
      async ({ id, data }: { id: string | number; data: any }) => {
        return await apiClient.request(routeName, data, { id });
      }
    );

    const deleteThunk = createAsyncThunk<any, string | number>(
      `${routeName}/delete`,
      async (id: string | number) => {
        await apiClient.request(routeName, undefined, { id });
        return id;
      }
    );

    // Create slice
    const initialState: SliceState = {
      items: [],
      currentItem: null,
      loading: {
        fetch: false,
        create: false,
        update: false,
        delete: false,
      },
      errors: {
        fetch: null,
        create: null,
        update: null,
        delete: null,
      },
      meta: {
        total: 0,
        page: 1,
        hasMore: false,
      },
    };

    const slice = createSlice({
      name: routeName,
      initialState,
      reducers: {
        clearErrors: (state) => {
          state.errors = {
            fetch: null,
            create: null,
            update: null,
            delete: null,
          };
        },
        setCurrentItem: (state, action: PayloadAction<any>) => {
          state.currentItem = action.payload;
        },
        clearCurrentItem: (state) => {
          state.currentItem = null;
        },
        addItem: (state, action: PayloadAction<any>) => {
          state.items.push(action.payload);
        },
        updateItem: (state, action: PayloadAction<{ id: string | number; data: any }>) => {
          const index = state.items.findIndex(item => item.id === action.payload.id);
          if (index !== -1) {
            state.items[index] = { ...state.items[index], ...action.payload.data };
          }
        },
        removeItem: (state, action: PayloadAction<string | number>) => {
          state.items = state.items.filter(item => item.id !== action.payload);
        },
        clearItems: (state) => {
          state.items = [];
        },
      },
      extraReducers: (builder) => {
        // Fetch
        builder
          .addCase(fetchThunk.pending, (state) => {
            state.loading.fetch = true;
            state.errors.fetch = null;
          })
          .addCase(fetchThunk.fulfilled, (state, action) => {
            state.loading.fetch = false;
            if (Array.isArray(action.payload)) {
              state.items = action.payload;
            } else {
              state.currentItem = action.payload;
            }
          })
          .addCase(fetchThunk.rejected, (state, action) => {
            state.loading.fetch = false;
            state.errors.fetch = action.error as ApiError;
          });

        // Create
        builder
          .addCase(createThunk.pending, (state) => {
            state.loading.create = true;
            state.errors.create = null;
          })
          .addCase(createThunk.fulfilled, (state, action) => {
            state.loading.create = false;
            state.items.push(action.payload);
          })
          .addCase(createThunk.rejected, (state, action) => {
            state.loading.create = false;
            state.errors.create = action.error as ApiError;
          });

        // Update
        builder
          .addCase(updateThunk.pending, (state) => {
            state.loading.update = true;
            state.errors.update = null;
          })
          .addCase(updateThunk.fulfilled, (state, action) => {
            state.loading.update = false;
            const index = state.items.findIndex(item => item.id === action.payload?.id);
            if (index !== -1) {
              state.items[index] = action.payload;
            }
          })
          .addCase(updateThunk.rejected, (state, action) => {
            state.loading.update = false;
            state.errors.update = action.error as ApiError;
          });

        // Delete
        builder
          .addCase(deleteThunk.pending, (state) => {
            state.loading.delete = true;
            state.errors.delete = null;
          })
          .addCase(deleteThunk.fulfilled, (state, action) => {
            state.loading.delete = false;
            state.items = state.items.filter(item => item.id !== action.payload);
          })
          .addCase(deleteThunk.rejected, (state, action) => {
            state.loading.delete = false;
            state.errors.delete = action.error as ApiError;
          });
      },
    });

    // Store slice and thunks
    slices[routeName] = {
      slice,
      actions: {
        ...slice.actions,
        fetch: fetchThunk,
        create: createThunk,
        update: updateThunk,
        delete: deleteThunk,
      },
      selectors: {
        selectItems: (state: any) => state[routeName]?.items || [],
        selectCurrentItem: (state: any) => state[routeName]?.currentItem,
        selectLoading: (state: any) => state[routeName]?.loading || {},
        selectErrors: (state: any) => state[routeName]?.errors || {},
        selectMeta: (state: any) => state[routeName]?.meta || {},
        selectIsLoading: (state: any) => Object.values(state[routeName]?.loading || {}).some(Boolean),
        selectHasError: (state: any) => Object.values(state[routeName]?.errors || {}).some(Boolean),
      },
    };

    reducers[routeName] = slice.reducer;
  });

  return { slices, reducers };
}