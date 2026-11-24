"use client";

import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@tomas-tc/ui";
import { TOMAS_AVATAR_IMAGE, TOMAS_AVATAR_SIZES, TOMAS_PEOPLE } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function AvatarsDemo() {
  return (
    <TomasUiDemo id="avatars">
      <div className="flex flex-wrap items-center gap-4">
        {TOMAS_AVATAR_SIZES.map((size) => (
          <Avatar key={size} size={size}>
            <AvatarImage src={TOMAS_AVATAR_IMAGE} alt="Narin Phonsri" />
            <AvatarFallback>NP</AvatarFallback>
          </Avatar>
        ))}
        <Avatar>
          <AvatarFallback>PK</AvatarFallback>
          <AvatarBadge className="bg-emerald-500" />
        </Avatar>
        <AvatarGroup>
          {TOMAS_PEOPLE.map((initials) => (
            <Avatar key={initials}>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
      </div>
    </TomasUiDemo>
  );
}
