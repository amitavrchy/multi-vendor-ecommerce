import { Empty } from '@/components/ui';
export default function NotFound() {
  return (
    <div className="container page">
      <Empty
        title="This find has wandered off"
        text="We couldn’t find that page. There’s plenty more to discover."
      />
    </div>
  );
}
