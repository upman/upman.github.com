Jekyll::Hooks.register :posts, :pre_render do |post|
  post.data['raw_content'] = post.content
end
