/**
 * Category management — list, add/edit (image, Arabic name, sort order),
 * delete.
 *
 * Self-contained so the same screen is served from both the store admin
 * (/admin → Categories) and the ERP (/admin/erp?tab=categories). Moved out
 * of Admin.jsx unchanged.
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function CategoriesManager() {
  const [adminCategories, setAdminCategories] = useState([]);
  const [catForm, setCatForm] = useState(null);
  const [catUploading, setCatUploading] = useState(false);

  useEffect(() => {
    api.get('/categories/all').then((res) => setAdminCategories(res.data));
  }, []);

  return (
    <div>
      <Button className="mb-4" onClick={() => setCatForm({ name: '', nameAr: '', image: '', sortOrder: 0, active: true, _editing: false })}>
        <Plus className="size-4" /> Add Category
      </Button>

      <Dialog open={!!catForm} onOpenChange={(o) => { if (!o) setCatForm(null); }}>
        {catForm && (
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{catForm._editing ? 'Edit Category' : 'New Category'}</DialogTitle></DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={async (e) => {
              e.preventDefault();
              try {
                const payload = { name: catForm.name, nameAr: catForm.nameAr || null, image: catForm.image, sortOrder: catForm.sortOrder, active: catForm.active };
                if (catForm._editing) { await api.put(`/categories/${catForm._id}`, payload); toast.success('Category updated'); }
                else { await api.post('/categories', payload); toast.success('Category created'); }
                setCatForm(null);
                api.get('/categories/all').then((res) => setAdminCategories(res.data));
              } catch (error) { toast.error(error.response?.data?.message || 'Failed'); }
            }}>
              <div className="flex flex-col gap-2">
                <Label>Category Name</Label>
                <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Arabic Name (optional)</Label>
                <Input dir="rtl" placeholder="الاسم بالعربية" value={catForm.nameAr || ''} onChange={(e) => setCatForm({ ...catForm, nameAr: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Category Image</Label>
                {catForm.image && (
                  <img src={catForm.image} alt="Preview" className="size-20 rounded-md border border-border object-cover" />
                )}
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setCatUploading(true);
                      try {
                        const formData = new FormData();
                        formData.append('image', file);
                        const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                        setCatForm({ ...catForm, image: data.url });
                      } catch (err) { toast.error('Upload failed'); } finally { setCatUploading(false); }
                    }}
                  />
                  {catUploading && <span className="text-xs text-primary">Uploading…</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 items-end gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Sort Order</Label>
                  <Input type="number" value={catForm.sortOrder} onChange={(e) => setCatForm({ ...catForm, sortOrder: parseInt(e.target.value) || 0 })} />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Checkbox checked={catForm.active} onCheckedChange={(v) => setCatForm({ ...catForm, active: !!v })} /> Active
                </label>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCatForm(null)}>Cancel</Button>
                <Button type="submit">{catForm._editing ? 'Update' : 'Create'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead><TableHead>Name</TableHead><TableHead>Arabic Name</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adminCategories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  {c.image ? (
                    <img src={c.image} alt={c.name} className="size-11 rounded-md object-cover" />
                  ) : (
                    <div className="flex size-11 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">No img</div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell dir="rtl" className="text-right">{c.nameAr || <span dir="ltr" className="text-xs text-muted-foreground">—</span>}</TableCell>
                <TableCell>{c.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={c.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}>{c.active ? 'Active' : 'Hidden'}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => setCatForm({ ...c, _editing: true, _id: c.id })}><Pencil className="size-4" /></Button>
                    <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                      if (!confirm('Delete this category?')) return;
                      await api.delete(`/categories/${c.id}`);
                      setAdminCategories(adminCategories.filter((x) => x.id !== c.id));
                      toast.success('Deleted');
                    }}><Trash2 className="size-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {adminCategories.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No categories yet. Add categories to show on the home page.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
