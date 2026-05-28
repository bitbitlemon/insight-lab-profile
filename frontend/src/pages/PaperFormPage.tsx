import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Selector, TextArea, Toast } from "antd-mobile";
import { useNavigate, useParams } from "react-router-dom";
import { createPaper, getPaper, updatePaper } from "../api/papers";
import { PageShell, colors, sectionCardStyle } from "../components/ui";

const venueTypeOptions = [
  { label: "期刊", value: "journal" },
  { label: "会议", value: "conference" },
];

const statusOptions = [
  { label: "进行中", value: "in_progress" },
  { label: "审稿中", value: "under_review" },
  { label: "已录用", value: "accepted" },
  { label: "已发表", value: "published" },
];

const PaperFormPage = () => {
  const navigate = useNavigate();
  const { paper_id } = useParams();
  const isEdit = Boolean(paper_id);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit || !paper_id) return;
    setPageLoading(true);
    getPaper(Number(paper_id))
      .then((p) => {
        form.setFieldsValue({
          title: p.title,
          authors_text: p.authors_text,
          venue: p.venue,
          venue_type: [p.venue_type || "journal"],
          venue_level: p.venue_level || "",
          year: p.year,
          doi: p.doi || "",
          status: [p.status || "in_progress"],
        });
      })
      .catch(() => Toast.show({ icon: "fail", content: "加载失败" }))
      .finally(() => setPageLoading(false));
  }, [form, isEdit, paper_id]);

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const year = Number(values.year);
      const payload = {
        title: String(values.title || "").trim(),
        authors_text: String(values.authors_text || "").trim(),
        venue: String(values.venue || "").trim(),
        venue_type: (Array.isArray(values.venue_type) ? values.venue_type[0] : "journal") as
          | "journal" | "conference" | "workshop" | "preprint",
        venue_level: (String(values.venue_level || "").trim() || undefined) as string | undefined,
        year: Number.isFinite(year) ? year : new Date().getFullYear(),
        doi: (String(values.doi || "").trim() || undefined) as string | undefined,
        status: (Array.isArray(values.status) ? values.status[0] : "in_progress") as
          | "in_progress" | "under_review" | "accepted" | "published" | "rejected",
      };
      if (isEdit && paper_id) {
        await updatePaper(Number(paper_id), payload);
        Toast.show({ icon: "success", content: "已保存" });
        navigate(`/papers/${paper_id}`);
      } else {
        const created = await createPaper(payload);
        Toast.show({ icon: "success", content: "已创建" });
        navigate(`/papers/${created.paper_id}`);
      }
    } catch (e) {
      Toast.show({ icon: "fail", content: isEdit ? "保存失败" : "创建失败" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <Card style={sectionCardStyle}>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.title, marginBottom: 16 }}>
          {isEdit ? "编辑论文" : "录入论文"}
        </div>
        {pageLoading ? (
          <div style={{ color: colors.muted, padding: 16 }}>加载中...</div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            initialValues={{ venue_type: ["journal"], status: ["in_progress"] }}
            footer={
              <Button type="submit" color="primary" block loading={submitting}>
                {isEdit ? "保存" : "提交"}
              </Button>
            }
          >
            <Form.Item label="标题" name="title" rules={[{ required: true, message: "请填写标题" }]}>
              <Input placeholder="论文标题" />
            </Form.Item>
            <Form.Item label="作者" name="authors_text" rules={[{ required: true, message: "请填写作者" }]}>
              <TextArea placeholder="如: 罗起宁, 农熏衣" autoSize={{ minRows: 2 }} />
            </Form.Item>
            <Form.Item label="期刊 / 会议" name="venue" rules={[{ required: true, message: "请填写期刊/会议" }]}>
              <Input placeholder="如: Scientific Reports" />
            </Form.Item>
            <Form.Item label="类型" name="venue_type">
              <Selector options={venueTypeOptions} />
            </Form.Item>
            <Form.Item label="分区 / 等级" name="venue_level">
              <Input placeholder="如: 中科院一区 · JCR Q1" />
            </Form.Item>
            <Form.Item label="发表年份" name="year" rules={[{ required: true, message: "请填写年份" }]}>
              <Input placeholder="2026" type="number" />
            </Form.Item>
            <Form.Item label="DOI" name="doi">
              <Input placeholder="可选" />
            </Form.Item>
            <Form.Item label="状态" name="status">
              <Selector options={statusOptions} />
            </Form.Item>
          </Form>
        )}
      </Card>
    </PageShell>
  );
};

export default PaperFormPage;
