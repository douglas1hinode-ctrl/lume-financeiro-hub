import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useSupabaseQuery<T>(
  key: string[],
  table: string,
  options?: { select?: string; orderBy?: string; ascending?: boolean; filters?: Record<string, any> }
) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      let query = (supabase as any)
        .from(table)
        .select(options?.select || '*')
        .order(options?.orderBy || 'created_at', { ascending: options?.ascending ?? false });

      if (options?.filters) {
        for (const [col, val] of Object.entries(options.filters)) {
          if (val !== undefined && val !== null && val !== '') {
            query = query.eq(col, val);
          }
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as T[];
    },
  });
}

export function useSupabaseInsert(table: string, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const { data, error } = await (supabase as any).from(table).insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useSupabaseUpdate(table: string, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: Record<string, any>) => {
      const { data, error } = await (supabase as any).from(table).update(values).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

export function useSupabaseDelete(table: string, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}
