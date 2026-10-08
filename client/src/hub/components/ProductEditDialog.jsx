import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ImageOff, Loader2, Lock, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/hub/ui/alert-dialog';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Switch } from '@/hub/ui/switch';
import { Textarea } from '@/hub/ui/textarea';
import {
  accessQuery,
  deleteProduct,
  productLockQuery,
  setProductActive,
  suppliersQuery,
  updateProduct,
  uploadProductImage,
} from '@/hub/lib/api';
import { invalidateStock } from '@/hub/lib/invalidate';
import { can } from '@/hub/lib/permissions';

// Remounted on every opening (see the key), so the form starts from the
// product's current values each time.
export function ProductEditDialog(props) {
  return <ProductEditDialogForm key={props.open ? `open:${props.product?.key ?? ''}` : 'closed'} {...props} />;
}

function ProductEditDialogForm({ product, open, onClose }) {
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const suppliers = useQuery({ ...suppliersQuery, enabled: open });
  const fileInput = useRef(null);

  const canEditPrice = can(access, 'products.edit_price');
  const canEditCost = can(access, 'products.edit_cost');
  const canViewCost = can(access, 'products.view_cost');
  const canImages = can(access, 'products.images');
  const canDeactivate = can(access, 'products.deactivate');
  const isAdmin = Boolean(access?.isAdmin);

  const [productCode, setProductCode] = useState(product?.productCode ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [rack, setRack] = useState(product?.rack ?? '');
  const [shelf, setShelf] = useState(product?.shelfLocation ?? '');
  const [supplier, setSupplier] = useState(product?.supplier ?? '');
  const [cost, setCost] = useState(String(product?.costPrice ?? 0));
  const [price, setPrice] = useState(String(product?.sellingPriceQar ?? 0));
  const [reorder, setReorder] = useState(String(product?.reorderLevel ?? 3));
  const [notes, setNotes] = useState(product?.notes ?? '');
  const [size, setSize] = useState(product?.size ?? '');
  const [color, setColor] = useState(product?.color ?? '');
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [imagePath, setImagePath] = useState(product?.imageUrl ?? null);
  const [imagePreview, setImagePreview] = useState(product?.imageUrl ?? null);
  const [pendingFile, setPendingFile] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const lock = useQuery({ ...productLockQuery(product?.key ?? ''), enabled: open && Boolean(product?.key) });

  const dirty = useMemo(() => {
    if (!product) return false;
    return (
      productCode !== (product.productCode ?? '') ||
      name !== product.name ||
      category !== (product.category ?? '') ||
      rack !== (product.rack ?? '') ||
      shelf !== (product.shelfLocation ?? '') ||
      supplier !== (product.supplier ?? '') ||
      Number(price) !== Number(product.sellingPriceQar) ||
      (canEditCost && Number(cost) !== Number(product.costPrice)) ||
      Number(reorder) !== Number(product.reorderLevel) ||
      notes !== (product.notes ?? '') ||
      size !== (product.size ?? '') ||
      color !== (product.color ?? '') ||
      isActive !== product.isActive ||
      imagePath !== (product.imageUrl ?? null) ||
      Boolean(pendingFile)
    );
  }, [product, productCode, name, category, rack, shelf, supplier, price, cost, canEditCost, reorder, notes, size, color, isActive, imagePath, pendingFile]);

  const variantLocked = lock.data?.hasHistory ?? true;
  // Size and colour belong to a variant; a product without variants has none to edit.
  const hasVariant = product?.variantIndex !== null && product?.variantIndex !== undefined;

  const save = useMutation({
    mutationFn: async () => {
      if (!product) return null;
      let nextImage = imagePath;
      if (pendingFile) nextImage = await uploadProductImage(pendingFile);
      return updateProduct(product.key, {
        productCode: productCode.trim() || null,
        name,
        category: category || null,
        rack: rack || null,
        shelfLocation: shelf || null,
        supplier: supplier || null,
        costPrice: canEditCost ? Number(cost) : null,
        sellingPriceQar: canEditPrice ? Number(price) : Number(product.sellingPriceQar),
        reorderLevel: Number(reorder) || 0,
        notes: notes || null,
        isActive,
        imageUrl: nextImage,
        ...(variantLocked || !hasVariant ? {} : { size: size || null, color: color || null }),
      });
    },
    onSuccess: async (result) => {
      if (!result) return;
      toast.success(
        result.changes ? `Product updated (${result.changes} field${result.changes === 1 ? '' : 's'})` : 'No changes to save',
      );
      await invalidateStock(client, product.key);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: async () => {
      if (!product) return;
      await setProductActive(product.key, !product.isActive);
    },
    onSuccess: async () => {
      toast.success(product?.isActive ? 'Product deactivated' : 'Product reactivated');
      if (product) await invalidateStock(client, product.key);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!product) return;
      await deleteProduct(product.key);
    },
    onSuccess: async () => {
      toast.success('Product deleted permanently');
      if (product) await invalidateStock(client, product.key);
      setConfirmDelete(false);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  const attemptClose = () => {
    if (dirty && !save.isPending) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const pickImage = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    setPendingFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const canDeletePermanently =
    isAdmin && !variantLocked && (product?.currentStock ?? 0) === 0 && lock.data && !lock.data.hasHistory;

  if (!product) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && attemptClose()}>
        <DialogContent className="z-[70] max-h-[92vh] w-full max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6">Edit product · {product.sku}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* image */}
            <section className="flex flex-wrap items-center gap-4">
              {imagePreview ? (
                <img src={imagePreview} alt={name} className="size-24 rounded-2xl border border-border object-cover" />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">
                  No image
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => pickImage(event.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={!canImages}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="mr-2 size-4" /> {imagePreview ? 'Replace image' : 'Upload image'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={!canImages || (!imagePreview && !imagePath)}
                  onClick={() => {
                    setPendingFile(null);
                    setImagePath(null);
                    setImagePreview(null);
                  }}
                >
                  <ImageOff className="mr-2 size-4" /> Remove
                </Button>
                {!canImages && <p className="w-full text-xs text-muted-foreground">You do not have image permission.</p>}
              </div>
            </section>

            {/* locked identity */}
            <section className="rounded-2xl bg-secondary/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Labelled label="Product Code">
                  <Input
                    value={productCode}
                    onChange={(event) => setProductCode(event.target.value.replace(/\D/g, ''))}
                    onBlur={(event) => {
                      const digits = event.target.value.replace(/\D/g, '');
                      setProductCode(digits ? digits.padStart(4, '0') : '');
                    }}
                    inputMode="numeric"
                    placeholder="0001"
                    disabled={!isAdmin}
                    className="h-11 font-mono"
                  />
                </Labelled>
                <Labelled label="SKU Code (permanent)">
                  <Input value={product.sku} readOnly className="h-11 bg-muted font-mono" />
                </Labelled>
                <Labelled label="Size / Age">
                  <Input
                    value={size}
                    onChange={(event) => setSize(event.target.value)}
                    disabled={variantLocked || !isAdmin || !hasVariant}
                    className="h-11"
                  />
                </Labelled>
                <Labelled label="Colour / Variant">
                  <Input
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    disabled={variantLocked || !isAdmin || !hasVariant}
                    className="h-11"
                  />
                </Labelled>
              </div>
              {variantLocked && (
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 size-3.5 shrink-0" />
                  This product has transaction history. Create a new SKU for a different size or colour — historical records
                  must be preserved.
                </p>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <Labelled label="Product name">
                <Input value={name} onChange={(event) => setName(event.target.value)} className="h-11" />
              </Labelled>
              <Labelled label="Category">
                <Input value={category} onChange={(event) => setCategory(event.target.value)} className="h-11" />
              </Labelled>
              <Labelled label="Rack">
                <Input value={rack} onChange={(event) => setRack(event.target.value)} className="h-11" />
              </Labelled>
              <Labelled label="Shelf / location">
                <Input value={shelf} onChange={(event) => setShelf(event.target.value)} className="h-11" />
              </Labelled>
              <Labelled label="Default supplier">
                <Input
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                  placeholder="Not Assigned"
                  list="femnia-suppliers"
                  className="h-11"
                />
                <datalist id="femnia-suppliers">
                  {(suppliers.data ?? []).map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-muted-foreground">
                  Type a new supplier or pick a previous one. Past Stock In records are never changed.
                </p>
              </Labelled>
              <Labelled label="Reorder level">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={reorder}
                  onChange={(event) => setReorder(event.target.value)}
                  className="h-11"
                />
              </Labelled>
              <Labelled label={canViewCost ? 'Cost price (QAR)' : 'Cost price (hidden)'}>
                <Input
                  type="number"
                  step="0.01"
                  value={canViewCost ? cost : ''}
                  onChange={(event) => setCost(event.target.value)}
                  disabled={!canEditCost || !canViewCost}
                  placeholder={canViewCost ? '' : 'No cost permission'}
                  className="h-11"
                />
              </Labelled>
              <Labelled label="Selling price (QAR)">
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={!canEditPrice}
                  className="h-11"
                />
              </Labelled>
            </div>

            <Labelled label="Notes">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
            </Labelled>

            <div className="flex items-center justify-between rounded-2xl border border-border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Active for new orders</p>
                <p className="text-xs text-muted-foreground">
                  Inactive products stay in history and past orders but cannot be added to new orders.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} disabled={!canDeactivate} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                {canDeactivate && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={toggleActive.isPending}
                    onClick={() => toggleActive.mutate()}
                  >
                    {product.isActive ? 'Deactivate product' : 'Reactivate product'}
                  </Button>
                )}
                {canDeletePermanently && (
                  <Button type="button" variant="destructive" className="h-11" onClick={() => setConfirmDelete(true)}>
                    Delete permanently
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={attemptClose}>
                  Cancel
                </Button>
                <Button type="button" className="h-11" disabled={save.isPending || !dirty} onClick={() => save.mutate()}>
                  {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Editing a product never changes stock quantities or past sales — use Adjust Stock for quantity corrections.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent className="z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Discard unsaved changes?
            </AlertDialogTitle>
            <AlertDialogDescription>Your edits to this product have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                onClose();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {product.sku} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This product has zero stock and no orders, sales, stock movements or returns. Permanent deletion cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate()}>
              Delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Labelled({ label, children }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
