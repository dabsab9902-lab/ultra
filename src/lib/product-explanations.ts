import type { Product } from "@/lib/types";

const GENERIC_EXPLANATION =
  "Подходит для комплектации электромонтажных работ и регулярных B2B-заказов.";

export function getProductExplanation(product: Product) {
  const description = cleanDescription(product);
  if (description) return description;

  const text = getProductInsightText(product);

  if (text.includes("ввг")) {
    return "Силовой кабель для стационарной проводки в жилых и коммерческих объектах.";
  }
  if (text.includes("пвс")) {
    return "Гибкий провод для подключения оборудования, удлинителей и переносных линий.";
  }
  if (text.includes("шввп")) {
    return "Гибкий шнур для подключения бытового и легкого электрооборудования.";
  }
  if (text.includes("сип")) {
    return "Самонесущий изолированный провод для воздушных линий и вводов.";
  }
  if (text.includes("узо")) {
    return "Защищает человека и линию при утечке тока.";
  }
  if (text.includes("дифавтомат") || text.includes("диф автомат")) {
    return "Совмещает защиту от утечки, перегрузки и короткого замыкания.";
  }
  if (isBreakerText(text)) {
    return "Защищает линию от перегрузки и короткого замыкания.";
  }
  if (isCorrugationText(text)) {
    return "Гофра защищает кабель и помогает аккуратно проложить линию.";
  }
  if (text.includes("кабель канал") || text.includes("кабель-канал")) {
    return "Кабель-канал нужен для открытой и аккуратной прокладки кабеля.";
  }
  if (text.includes("розет") || text.includes("выключател")) {
    return "Элемент электрофурнитуры для комплектации точек подключения и управления.";
  }
  if (text.includes("светильник") || text.includes("прожектор")) {
    return "Светотехническое решение для общего, рабочего или акцентного освещения.";
  }
  if (text.includes("ламп")) {
    return "Источник света для замены или комплектации светильников.";
  }
  if (text.includes("щит") || text.includes("бокс")) {
    return "Корпус для размещения автоматики, клемм и распределения линий.";
  }
  if (text.includes("клемм")) {
    return "Используется для надежного соединения и распределения проводников.";
  }
  if (text.includes("изолент")) {
    return "Расходный материал для изоляции и маркировки соединений.";
  }
  if (text.includes("стяж")) {
    return "Помогает собрать и закрепить кабельные линии в аккуратный пучок.";
  }

  return GENERIC_EXPLANATION;
}

export function getProductInsightText(product: Product) {
  return normalizeInsightText(
    [
      product.name,
      product.sku,
      product.brand,
      product.categoryId,
      product.subcategory,
      product.categoryPath?.join(" "),
      Object.values(product.specs ?? {}).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function normalizeInsightText(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(product: Product) {
  const description = product.description?.trim();
  if (!description || description.length > 130) return "";

  const normalizedDescription = normalizeInsightText(description);
  const normalizedName = normalizeInsightText(product.name);
  const normalizedCategory = normalizeInsightText(
    `${product.categoryId} ${product.subcategory}`
  );

  if (normalizedDescription === normalizedName) return "";
  if (normalizedDescription.startsWith(normalizedName)) return "";
  if (normalizedCategory && normalizedDescription.includes(normalizedCategory)) {
    return "";
  }

  return description;
}

function isBreakerText(text: string) {
  return (
    text.includes("автомат") ||
    text.includes("выключатель автоматический") ||
    text.includes("mcb")
  );
}

function isCorrugationText(text: string) {
  return text.includes("гофра") || text.includes("гофротруб");
}
