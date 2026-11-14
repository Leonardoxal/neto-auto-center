/** Lê todas as linhas de uma consulta do Supabase, de 1000 em 1000 (o servidor limita cada resposta). */
export async function pegar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) return out
  }
}
