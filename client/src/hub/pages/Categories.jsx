import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { accessQuery, uploadProductImage } from '@/hub/lib/api';
import { deleteCategory, saveCategory, sk, storeCategoriesQuery } from '@/hub/lib/apiStore';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { Badge } from '@/hub/ui/badge';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Switch } from '@/hub/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/hub/ui/table';

const BLANK = { name: '', nameAr: '', image: '', sortOrder: 0, active: true };

/** Storefront categories (/hub/categories): names, Arabic names, images, order, visibility. */
export default function CategoriesPage() {
  useHubTitle('Categories — FEMNIA Hub');
  const access = useQuery(accessQuery).data;
  const allowed = access?.isAdmin || access?.legacy?.includes('categories');
  const qc = useQueryClient();
  const list = useQuery({ ...storeCategoriesQuery, enabled: Boolean(allowed) });
  const [editing, setEditing] = useState(null);

  const remove = useMutation({
    mutationFn: (c) => deleteCategory(c.id),
    onSuccess: () => {
      toast.success('Category deleted');
      qc.invalidateQueries({ queryKey: sk.categories });
    },
    onError: (e) => toast.error(e.message),
  });

  if (access && !allowed) {
    return (
      <div>
        <PageHeader title="Categories" />
        <p className="text-sm text-muted-foreground">You do not have permission to manage categories.</p>
      </div>
    );
  }

  const rows = list.data ?? [];
  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Storefront categories: names, images, order and Arabic names."
        onRefresh={() => list.refetch()}
        refreshing={list.isFetching}
        actions={
          <Button className="h-10" onClick={() => setEditing({ ...BLANK })}>
            <Plus className="mr-2 size-4" /> Add category
          </Button>
        }
      />

      {list.isPending ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState section="Categories" message={list.error?.message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No categories yet" hint="Add categories to show on the home page." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Arabic name</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.image ? (
                      <img src={c.image} alt="" className="size-10 rounded-lg object-cover" />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                        <ImageIcon className="size-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell dir="rtl" className="text-left">{c.nameAr || '—'}</TableCell>
                  <TableCell>{c.sortOrder}</TableCell>
                  <TableCell>
                    <Badge variant={c.active ? 'default' : 'secondary'}>{c.active ? 'Active' : 'Hidden'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing({ ...c })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        className="text-destructive hover:text-destructive"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete the category "${c.name}"?`)) remove.mutate(c);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <CategoryForm key={editing.id ?? 'new'} initial={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function CategoryForm({ initial, onDone }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      saveCategory(initial.id, {
        name: form.name,
        nameAr: form.nameAr || null,
        image: form.image,
        sortOrder: form.sortOrder,
        active: form.active,
      }),
    onSuccess: () => {
      toast.success(initial.id ? 'Category updated' : 'Category created');
      qc.invalidateQueries({ queryKey: sk.categories });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      set({ image: await uploadProductImage(file) });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial.id ? 'Edit category' : 'New category'}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-name-ar">Arabic name</Label>
          <Input
            id="cat-name-ar"
            dir="rtl"
            placeholder="الاسم بالعربية"
            value={form.nameAr || ''}
            onChange={(e) => set({ nameAr: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Image</Label>
          <div className="flex items-center gap-3">
            {form.image ? (
              <img src={form.image} alt="" className="size-16 rounded-lg object-cover" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-lg bg-muted">
                <ImageIcon className="size-5 text-muted-foreground" />
              </div>
            )}
            <Button type="button" variant="outline" asChild disabled={uploading}>
              <label className="cursor-pointer">
                {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                {form.image ? 'Replace image' : 'Upload image'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </Button>
            {form.image && (
              <Button type="button" variant="ghost" onClick={() => set({ image: '' })}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-order">Sort order</Label>
          <Input
            id="cat-order"
            type="number"
            value={form.sortOrder}
            onChange={(e) => set({ sortOrder: parseInt(e.target.value, 10) || 0 })}
          />
          <p className="text-xs text-muted-foreground">Lower numbers show first.</p>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
          Active (shown on the storefront)
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || uploading}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {initial.id ? 'Save changes' : 'Create category'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
