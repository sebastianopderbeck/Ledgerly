export interface ScrollView {
  scrollLeft: number;
  width: number;
}

export interface ScrollItem {
  left: number;
  width: number;
}

export const scrollToReveal = (view: ScrollView, item: ScrollItem): number => {
  const itemRight = item.left + item.width;
  if (item.left < view.scrollLeft || item.width > view.width) return item.left;
  if (itemRight > view.scrollLeft + view.width) return itemRight - view.width;
  return view.scrollLeft;
};
