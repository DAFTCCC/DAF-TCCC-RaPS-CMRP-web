-- Fix FieldReady evaluation immutability trigger delete behavior.
-- Finalized evaluations remain immutable. Unfinalized evaluations may be
-- deleted for controlled administrative cleanup/retest workflows.

create or replace function public.fr_block_finalized_evaluation_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.finalized_at is not null then
    raise exception 'Finalized FieldReady evaluations are immutable. Use controlled correction/retest.';
  end if;

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end;
$$;
