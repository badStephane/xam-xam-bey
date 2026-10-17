-- Paliers de difficulté (2026-10-17) : colonne cards.tier, 1 par défaut, de 1 à 3.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'cards', 'tier', 'cards.tier existe');
select col_not_null('public', 'cards', 'tier', 'cards.tier est obligatoire');
select col_default_is('public', 'cards', 'tier', '1', 'palier 1 par défaut (questions existantes)');

insert into public.cards (id, zone, q, a, status) values ('tier-test-1', 1, 'Q palier ?', 'R', 'draft');
select is((select tier from public.cards where id = 'tier-test-1'), 1::smallint, 'une question sans palier est au palier 1');
select throws_ok($$insert into public.cards (id, zone, q, a, tier) values ('tier-test-4', 1, 'Q', 'R', 4)$$, '23514', null, 'palier 4 refusé');

select * from finish();
rollback;
