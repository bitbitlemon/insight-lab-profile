import { PageShell, SectionLoading } from "./ui";

interface LoadingProps {
  text?: string;
}

const Loading = ({ text = "加载中..." }: LoadingProps) => {
  return (
    <PageShell>
      <div
        style={{
          minHeight: "52vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SectionLoading text={text} />
      </div>
    </PageShell>
  );
};

export default Loading;
