import CardShine from './CardShine';
import { cardImageUrl } from '../lib/cardUrl';

// A creator's holographic card: the still card image with the CSS shine over
// it. `className` styles the card box (width, shadow, hover); the image fills it.
export default function CardImage({ platform, username, mark = true, tier, alt = '', loading, className = '', imgClassName = '', shine = true, ...rest }) {
  return (
    <span className={`relative block overflow-hidden rounded-[6.4%/4.571%] ${className}`}>
      <img
        src={cardImageUrl(platform, username, { mark })}
        alt={alt}
        width="250"
        height="350"
        loading={loading}
        decoding="async"
        draggable="false"
        className={`block w-full h-auto select-none ${imgClassName}`}
        {...rest}
      />
      {shine && <CardShine tier={tier} />}
    </span>
  );
}
