import { SalesOrderForm } from '@/hub/components/SalesOrderForm';
import { useHubTitle } from '@/hub/lib/useHubTitle';

export default function NewSalesOrderPage() {
  useHubTitle('New Sales Order — FEMNIA Hub');
  return <SalesOrderForm />;
}
